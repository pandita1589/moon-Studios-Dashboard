import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { getTasks, updateTask, getAllUsers } from '@/lib/firebase';
import TaskReportDialog from '@/components/TaskReportDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  CheckCircle2, Flag, Calendar as CalendarIcon,
  AlignLeft, ChevronLeft, ChevronRight, Lock,
  UserCheck, UsersRound, Eye, Ban, ListTodo, X, ShieldCheck,
  Filter, LayoutGrid, List, Search, AlertCircle, PartyPopper
} from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameMonth, isSameDay, addMonths, subMonths,
  startOfWeek, endOfWeek, isPast, isToday, startOfDay,
  differenceInDays,
} from 'date-fns';
import { es } from 'date-fns/locale';
import type { Task, UserProfile, UserRole } from '@/types';

// ── Hex to RGB helper ─────────────────────────────────────────────────────────
function hexToRgb(hex: string) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) } : null;
}

// ── Theme variables injected into :root so Dialog portals also get them ───────
const injectThemeVars = (isDark: boolean, accentColor: string) => {
  const id = 'cal-theme-root-vars';
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    document.head.appendChild(style);
  }

  const accentRgb = hexToRgb(accentColor);
  const aRgb = accentRgb ? `${accentRgb.r},${accentRgb.g},${accentRgb.b}` : '99,102,241';

  const dark = isDark;
  style.textContent = `
    :root {
      --cal-accent: ${accentColor};
      --cal-accent-rgb: ${aRgb};
      --cal-bg:               ${dark ? '#0c0c0e'              : '#f8fafc'};
      --cal-card-bg:          ${dark ? '#141416'              : '#ffffff'};
      --cal-overlay:          ${dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'};
      --cal-border:           ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.09)'};
      --cal-text-primary:     ${dark ? '#f1f5f9'              : '#0f172a'};
      --cal-text-secondary:   ${dark ? '#cbd5e1'              : '#334155'};
      --cal-text-muted:       ${dark ? '#64748b'              : '#64748b'};
      --cal-text-quaternary:  ${dark ? '#334155'              : '#cbd5e1'};
      --cal-holiday-bg:       ${dark ? 'rgba(251,191,36,0.10)' : 'rgba(251,146,60,0.10)'};
      --cal-holiday-border:   ${dark ? 'rgba(251,191,36,0.22)' : 'rgba(251,146,60,0.22)'};
      --cal-holiday-color:    ${dark ? '#fbbf24'              : '#ea580c'};
      --cal-dialog-bg:        ${dark ? '#141416'              : '#ffffff'};
      --cal-dialog-border:    ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.09)'};
      --cal-dialog-text:      ${dark ? '#f1f5f9'              : '#0f172a'};
    }
  `;
};

// ── CSS animations & component styles (static — no theme vars needed) ─────────
const CAL_STYLES = `
  @keyframes cal-fade-in  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes cal-panel-in { from{opacity:0;transform:translateX(10px) scale(0.97)} to{opacity:1;transform:translateX(0) scale(1)} }
  @keyframes cal-scale-in { from{opacity:0;transform:scale(0.92)} to{opacity:1;transform:scale(1)} }
  @keyframes cal-spin     { to{transform:rotate(360deg)} }
  @keyframes cal-stagger  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }

  .cal-root { display:flex;flex-direction:column;gap:16px;animation:cal-fade-in 0.28s cubic-bezier(0.16,1,0.3,1); }

  .cal-card { border-radius:16px;padding:16px;border:1px solid var(--cal-border);background:var(--cal-card-bg); }

  .cal-grid-wrap { border-radius:16px;overflow:hidden;background:var(--cal-card-bg);border:1px solid var(--cal-border); }
  .cal-weekday { text-align:center;font-size:9px;font-weight:300;letter-spacing:0.1em;text-transform:uppercase;padding:8px 0;color:var(--cal-text-muted); }

  .cal-day { min-height:72px;padding:6px 5px;border-radius:10px;background:var(--cal-card-bg);border:1px solid var(--cal-border);transition:background 0.15s,border-color 0.15s,box-shadow 0.15s;position:relative; }
  .cal-day.other-month { background:transparent;border-color:transparent;opacity:0.2; }
  .cal-day.selected   { background:rgba(var(--cal-accent-rgb),0.08);border-color:rgba(var(--cal-accent-rgb),0.35);box-shadow:0 0 0 1px rgba(var(--cal-accent-rgb),0.15); }
  .cal-day.clickable  { cursor:pointer; }
  .cal-day.clickable:hover { background:var(--cal-overlay); }
  .cal-day.is-holiday { border-color:var(--cal-holiday-border) !important; }

  .cal-day-num { font-size:11px;text-align:center;width:22px;height:22px;border-radius:50%;margin:0 auto 3px;display:flex;align-items:center;justify-content:center;color:var(--cal-text-muted);border:1px solid transparent;font-weight:300;transition:background 0.15s; }
  .cal-day-num.today { background:rgba(var(--cal-accent-rgb),0.15);border-color:rgba(var(--cal-accent-rgb),0.35);color:var(--cal-accent);font-weight:500; }
  .cal-day-num.past  { color:var(--cal-text-quaternary); }

  .cal-holiday-dot { width:5px;height:5px;border-radius:50%;background:var(--cal-holiday-color);margin:0 auto 2px;display:block; }
  .cal-holiday-label { font-size:8px;font-weight:300;color:var(--cal-holiday-color);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;line-height:1.2;padding:0 2px; }

  .cal-panel { flex-shrink:0;display:flex;flex-direction:column;border-radius:16px;overflow:hidden;background:var(--cal-card-bg);border:1px solid var(--cal-border);animation:cal-panel-in 0.22s cubic-bezier(0.22,1,0.36,1); }
  .cal-panel-header { display:flex;align-items:flex-start;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--cal-border);flex-shrink:0; }
  .cal-panel-body { flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:6px;min-height:120px; }
  .cal-panel-body::-webkit-scrollbar { width:3px; }
  .cal-panel-body::-webkit-scrollbar-track { background:transparent; }
  .cal-panel-body::-webkit-scrollbar-thumb { background:var(--cal-border);border-radius:4px; }

  .cal-task-btn { width:100%;text-align:left;padding:10px 12px;border-radius:12px;background:var(--cal-card-bg);border:1px solid var(--cal-border);cursor:pointer;transition:background 0.15s,border-color 0.15s;font-family:inherit;color:var(--cal-text-primary); }
  .cal-task-btn:hover { background:var(--cal-overlay); }

  .cal-list-row { display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:12px;transition:background 0.15s;cursor:default; }
  .cal-list-row:hover { background:var(--cal-overlay); }

  .cal-nav-btn { width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:var(--cal-card-bg);border:1px solid var(--cal-border);color:var(--cal-text-primary);cursor:pointer;transition:all 0.15s;font-family:inherit; }
  .cal-nav-btn:hover { background:var(--cal-overlay); }

  .cal-icon-btn { width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.18s;font-family:inherit;border:1px solid var(--cal-border);background:transparent;color:var(--cal-text-muted); }
  .cal-icon-btn:hover  { background:var(--cal-overlay);color:var(--cal-text-primary); }
  .cal-icon-btn.active { background:rgba(var(--cal-accent-rgb),0.12);border-color:rgba(var(--cal-accent-rgb),0.3);color:var(--cal-accent); }

  .cal-close-btn { width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;background:var(--cal-card-bg);border:1px solid var(--cal-border);color:var(--cal-text-muted);cursor:pointer;transition:all 0.15s;font-family:inherit; }
  .cal-close-btn:hover { background:var(--cal-overlay);color:var(--cal-text-primary); }

  .cal-status-btn { background:none;border:none;cursor:pointer;padding:0;flex-shrink:0;transition:color 0.15s;font-family:inherit; }

  .cal-view-btn { font-size:12px;font-weight:300;padding:4px 10px;border-radius:8px;color:var(--cal-text-muted);background:var(--cal-card-bg);border:1px solid var(--cal-border);cursor:pointer;transition:all 0.15s;font-family:inherit; }
  .cal-view-btn:hover { background:var(--cal-overlay);color:var(--cal-text-primary); }

  .cal-report-btn { width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:11px 0;border-radius:12px;font-size:13px;font-weight:300;background:var(--cal-card-bg);border:1px solid var(--cal-border);color:var(--cal-text-primary);cursor:pointer;transition:all 0.15s;font-family:inherit; }
  .cal-report-btn:hover { background:var(--cal-overlay); }

  /* ── Dialog: override shadcn internals using :root vars ── */
  .cal-dialog-box { background:var(--cal-dialog-bg) !important;border:1px solid var(--cal-dialog-border) !important;border-radius:20px !important;max-height:90vh;overflow-y:auto;color:var(--cal-dialog-text) !important; }
  .cal-dialog-box [class*="DialogTitle"] { color:var(--cal-dialog-text) !important; }
  .cal-dialog-box [class*="DialogDescription"] { color:var(--cal-text-secondary) !important; }

  .cal-desc-box { font-size:13px;font-weight:300;line-height:1.7;padding:12px 14px;border-radius:10px;white-space:pre-wrap;background:var(--cal-overlay);border:1px solid var(--cal-border);color:var(--cal-text-secondary); }
  .cal-assignee-card { display:inline-flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;background:var(--cal-overlay);border:1px solid var(--cal-border); }
  .cal-assignee-av { width:28px;height:28px;border-radius:8px;background:rgba(167,139,250,0.12);border:1px solid rgba(167,139,250,0.22);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:500;color:#a78bfa; }

  .cal-lock-notice,.cal-no-interact { display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;background:var(--cal-overlay);border:1px solid var(--cal-border); }

  .cal-holiday-panel-item { display:flex;align-items:flex-start;gap:8px;padding:9px 12px;border-radius:10px;background:var(--cal-holiday-bg);border:1px solid var(--cal-holiday-border); }

  .cal-stats-grid { display:grid;grid-template-columns:repeat(3,1fr);gap:10px; }
  @media (max-width:400px) { .cal-stats-grid { grid-template-columns:1fr 1fr; } }

  .cal-stat-card { padding:14px 10px;border-radius:12px;background:var(--cal-card-bg);border:1px solid var(--cal-border);text-align:center;animation:cal-stagger 0.25s ease forwards;animation-fill-mode:both;opacity:0; }
  .cal-stat-card:nth-child(1){animation-delay:0.02s}
  .cal-stat-card:nth-child(2){animation-delay:0.06s}
  .cal-stat-card:nth-child(3){animation-delay:0.10s}

  .cal-filter-dropdown { position:absolute;top:calc(100% + 6px);right:0;min-width:200px;background:var(--cal-card-bg);border:1px solid var(--cal-border);border-radius:12px;overflow:hidden;z-index:100;animation:cal-scale-in 0.18s cubic-bezier(0.34,1.56,0.64,1); }

  .cal-filter-btn { padding:5px 10px;border-radius:7px;font-size:12px;cursor:pointer;border:1px solid var(--cal-border);background:var(--cal-card-bg);color:var(--cal-text-muted);transition:all 0.15s ease;font-family:inherit; }
  .cal-filter-btn:hover { background:var(--cal-overlay);color:var(--cal-text-primary); }
  .cal-filter-btn.active-filter { background:rgba(var(--cal-accent-rgb),0.12);border-color:rgba(var(--cal-accent-rgb),0.35);color:var(--cal-accent); }

  .cal-search-wrap { display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:10px;background:var(--cal-card-bg);border:1px solid var(--cal-border);transition:border-color 0.15s,box-shadow 0.15s; }
  .cal-search-wrap:focus-within { border-color:rgba(var(--cal-accent-rgb),0.4);box-shadow:0 0 0 3px rgba(var(--cal-accent-rgb),0.1); }
  .cal-search-wrap input { background:none;border:none;outline:none;font-size:13px;font-weight:300;color:var(--cal-text-primary);font-family:inherit;flex:1;min-width:0; }
  .cal-search-wrap input::placeholder { color:var(--cal-text-muted); }

  .cal-badge-today { font-size:9px;font-weight:500;letter-spacing:0.06em;padding:2px 7px;border-radius:999px;background:rgba(var(--cal-accent-rgb),0.15);color:var(--cal-accent);border:1px solid rgba(var(--cal-accent-rgb),0.25); }
  .cal-badge-past  { font-size:9px;font-weight:300;padding:2px 7px;border-radius:999px;color:var(--cal-text-muted);background:var(--cal-overlay);display:flex;align-items:center;gap:3px; }
  .cal-badge-overdue { font-size:10px;font-weight:300;padding:2px 7px;border-radius:999px;background:rgba(248,113,113,0.1);color:#f87171;flex-shrink:0; }

  .cal-empty { display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px; }

  .cal-spinner { width:26px;height:26px;border-radius:50%;border:2px solid var(--cal-border);border-top-color:var(--cal-accent);animation:cal-spin 0.8s linear infinite; }

  .cal-progress-bar { height:4px;border-radius:4px;background:var(--cal-border);overflow:hidden;margin-top:8px; }
  .cal-progress-fill { height:100%;border-radius:4px;transition:width 0.6s ease; }

  .cal-mobile-panel { display:none; }

  @media (max-width:1023px) { .cal-desktop-panel{display:none!important} .cal-mobile-panel{display:block} }
  @media (min-width:1024px) { .cal-desktop-layout{display:flex!important;gap:16px;align-items:flex-start} .cal-panel{width:300px} }

  .cal-grid-inner { display:grid;grid-template-columns:repeat(7,1fr);gap:3px; }
  @media (max-width:480px) { .cal-day{min-height:52px;padding:4px 3px} .cal-day-num{font-size:10px;width:20px;height:20px} }

  .cal-list-assignee { display:block; }
  @media (max-width:420px) { .cal-list-assignee{display:none} }

  .cal-list-rows>* { animation:cal-stagger 0.2s ease forwards;animation-fill-mode:both;opacity:0; }
  .cal-list-rows>*:nth-child(1){animation-delay:0.02s}
  .cal-list-rows>*:nth-child(2){animation-delay:0.05s}
  .cal-list-rows>*:nth-child(3){animation-delay:0.08s}
  .cal-list-rows>*:nth-child(4){animation-delay:0.11s}
  .cal-list-rows>*:nth-child(5){animation-delay:0.14s}
  .cal-list-rows>*:nth-child(6){animation-delay:0.17s}
  .cal-list-rows>*:nth-child(7){animation-delay:0.20s}
  .cal-list-rows>*:nth-child(8){animation-delay:0.23s}

  .cal-month-title { color:var(--cal-text-primary);font-weight:300;font-size:13px;min-width:120px;text-align:center;text-transform:capitalize; }

  .cal-task-chip { font-size:9px;padding:2px 4px;border-radius:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:300;line-height:1.3;display:block; }

  .cal-accent-btn { font-size:12px;padding:5px 12px;border-radius:8px;cursor:pointer;background:rgba(var(--cal-accent-rgb),0.1);border:1px solid rgba(var(--cal-accent-rgb),0.25);color:var(--cal-accent);font-family:inherit;transition:all 0.15s; }
  .cal-accent-btn:hover { background:rgba(var(--cal-accent-rgb),0.18); }
`;

// ── Constants ─────────────────────────────────────────────────────────────────
const isDayPast = (day: Date) => isPast(startOfDay(day)) && !isToday(day);

const PRI = {
  high:   { label: 'Alta',  color: '#f87171', bg: 'rgba(248,113,113,0.12)', dot: '#f87171' },
  medium: { label: 'Media', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  dot: '#fbbf24' },
  low:    { label: 'Baja',  color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  dot: '#4ade80' },
} as const;

const STA = {
  pending:       { label: 'Pendiente',   color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
  'in-progress': { label: 'En progreso', color: '#818cf8', bg: 'rgba(129,140,248,0.12)' },
  completed:     { label: 'Completada',  color: '#4ade80', bg: 'rgba(74,222,128,0.12)'  },
} as const;

const ROLE_CFG: Record<string, { label: string; color: string }> = {
  CEO:            { label: 'CEO',            color: '#c084fc' },
  Administración: { label: 'Administración', color: '#818cf8' },
  Empleado:       { label: 'Empleado',       color: '#94a3b8' },
};

type FilterStatus   = 'all' | 'pending' | 'in-progress' | 'completed';
type FilterPriority = 'all' | 'high' | 'medium' | 'low';
type ViewMode       = 'grid' | 'list';

// ── Nager.Date Holiday API ────────────────────────────────────────────────────
interface NagerHoliday {
  date: string;        // "YYYY-MM-DD"
  localName: string;
  name: string;
  countryCode: string;
  fixed: boolean;
  global: boolean;
  counties: string[] | null;
  launchYear: number | null;
  types: string[];
}

// Detect country from browser locale + timezone
const detectCountryCode = (): string => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tzMap: Record<string, string> = {
      'America/Lima': 'PE',
      'America/Bogota': 'CO',
      'America/Santiago': 'CL',
      'America/Buenos_Aires': 'AR',
      'America/Argentina/Buenos_Aires': 'AR',
      'America/Caracas': 'VE',
      'America/Guayaquil': 'EC',
      'America/La_Paz': 'BO',
      'America/Asuncion': 'PY',
      'America/Montevideo': 'UY',
      'America/Mexico_City': 'MX',
      'America/New_York': 'US',
      'America/Chicago': 'US',
      'America/Los_Angeles': 'US',
      'America/Sao_Paulo': 'BR',
      'Europe/Madrid': 'ES',
      'Europe/London': 'GB',
      'Europe/Paris': 'FR',
      'Europe/Berlin': 'DE',
      'Europe/Rome': 'IT',
      'Asia/Tokyo': 'JP',
      'Asia/Shanghai': 'CN',
      'Asia/Seoul': 'KR',
      'Asia/Kolkata': 'IN',
    };
    if (tzMap[tz]) return tzMap[tz];
    // Fallback: try navigator.language region
    const lang = navigator.language || '';
    const region = lang.split('-')[1]?.toUpperCase();
    return region && region.length === 2 ? region : 'PE';
  } catch {
    return 'PE';
  }
};

const fetchHolidays = async (countryCode: string, year: number): Promise<NagerHoliday[]> => {
  try {
    const res = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
};

// ── Extended Task shape (adds optional assignment fields beyond base Task) ─────
interface ExtTask extends Task {
  assignedTo?: string;
  assignedToRole?: UserRole;
}

// ── Visibility helpers ────────────────────────────────────────────────────────
const canUserSeeTask = (task: ExtTask, userProfile: UserProfile | null): boolean => {
  if (!userProfile) return false;
  if (userProfile.role === 'CEO') return true;
  if (!task.assignedTo && !task.assignedToRole) return true;
  if (task.assignedTo) return task.assignedTo === userProfile.uid;
  if (task.assignedToRole) return task.assignedToRole === userProfile.role;
  return false;
};
const canUserInteract = (task: ExtTask, userProfile: UserProfile | null) => canUserSeeTask(task, userProfile);

// ── ReadOnlyTaskView ──────────────────────────────────────────────────────────
const ReadOnlyTaskView: React.FC<{ task: ExtTask; users: UserProfile[]; isCEO: boolean }> = ({ task, users, isCEO }) => {
  const pri = PRI[task.priority as keyof typeof PRI] ?? PRI.medium;
  const sta = STA[task.status as keyof typeof STA] ?? STA.pending;
  const assignedUser = task.assignedTo ? users.find(u => u.uid === task.assignedTo) ?? null : null;
  const assignedRole = task.assignedToRole ?? null;
  const roleCfg      = assignedRole ? ROLE_CFG[assignedRole] : null;
  const dueDate      = new Date(task.date);
  const daysLeft     = differenceInDays(dueDate, new Date());
  const isOverdue    = daysLeft < 0 && task.status !== 'completed';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
      {!isCEO && (
        <div className="cal-lock-notice">
          <Lock style={{ width: 14, height: 14, flexShrink: 0, color: 'var(--cal-text-muted)' }} strokeWidth={1.5} />
          <p style={{ fontSize: 12, fontWeight: 300, color: 'var(--cal-text-muted)' }}>Solo el CEO puede modificar tareas.</p>
        </div>
      )}

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: pri.dot, flexShrink: 0 }} />
          <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20, color: sta.color, background: sta.bg, fontWeight: 300 }}>{sta.label}</span>
          {isOverdue && <span className="cal-badge-overdue">Vencida</span>}
        </div>
        <p style={{ fontWeight: 300, fontSize: 16, lineHeight: 1.4, color: 'var(--cal-text-primary)' }}>{task.title}</p>
      </div>

      {task.description && (
        <div>
          <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--cal-text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <AlignLeft style={{ width: 12, height: 12 }} strokeWidth={1.5} /> Descripción
          </p>
          <p className="cal-desc-box">{task.description}</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--cal-text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Flag style={{ width: 12, height: 12 }} strokeWidth={1.5} /> Prioridad
          </p>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 300, padding: '5px 10px', borderRadius: 8, background: pri.bg, color: pri.color }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: pri.color }} />
            {pri.label}
          </span>
        </div>
        <div>
          <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--cal-text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <CalendarIcon style={{ width: 12, height: 12 }} strokeWidth={1.5} /> Fecha límite
          </p>
          <p style={{ fontSize: 13, fontWeight: 300, color: isOverdue ? '#f87171' : 'var(--cal-text-secondary)' }}>
            {format(dueDate, "d 'de' MMMM yyyy", { locale: es })}
          </p>
          {!isOverdue && task.status !== 'completed' && daysLeft >= 0 && (
            <p style={{ fontSize: 11, fontWeight: 300, color: daysLeft <= 2 ? '#fbbf24' : 'var(--cal-text-muted)', marginTop: 2 }}>
              {daysLeft === 0 ? 'Vence hoy' : `${daysLeft} día${daysLeft !== 1 ? 's' : ''} restante${daysLeft !== 1 ? 's' : ''}`}
            </p>
          )}
        </div>
      </div>

      {assignedUser && (
        <div>
          <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--cal-text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <UserCheck style={{ width: 12, height: 12 }} strokeWidth={1.5} /> Asignado a
          </p>
          <div className="cal-assignee-card">
            <div className="cal-assignee-av">{assignedUser.displayName?.[0]?.toUpperCase() ?? '?'}</div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 300, color: 'var(--cal-text-primary)' }}>{assignedUser.displayName}</p>
              <p style={{ fontSize: 11, fontWeight: 300, color: 'var(--cal-text-muted)' }}>{assignedUser.email}</p>
            </div>
          </div>
        </div>
      )}

      {!assignedUser && assignedRole && roleCfg && (
        <div>
          <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--cal-text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <UsersRound style={{ width: 12, height: 12 }} strokeWidth={1.5} /> Rol asignado
          </p>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 300, padding: '5px 10px', borderRadius: 8, background: `${roleCfg.color}18`, color: roleCfg.color }}>
            <UsersRound style={{ width: 12, height: 12 }} strokeWidth={1.5} />
            {roleCfg.label}
          </span>
        </div>
      )}
    </div>
  );
};

// ── DayPanel ──────────────────────────────────────────────────────────────────
const DayPanel: React.FC<{
  day: Date; tasks: ExtTask[]; users: UserProfile[]; holidays: NagerHoliday[];
  onTaskClick: (task: ExtTask) => void; onClose: () => void;
}> = ({ day, tasks, users, holidays, onTaskClick, onClose }) => {
  const past  = isDayPast(day);
  const today = isToday(day);
  const dayHolidays = holidays.filter(h => isSameDay(new Date(h.date), day));

  return (
    <div className="cal-panel">
      <div className="cal-panel-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ fontWeight: 300, fontSize: 13, color: 'var(--cal-text-primary)', textTransform: 'capitalize' }}>
              {today ? 'Hoy' : format(day, "EEEE d MMM", { locale: es })}
            </p>
            {today && <span className="cal-badge-today">HOY</span>}
            {past  && <span className="cal-badge-past"><Ban style={{ width: 9, height: 9 }} strokeWidth={1.5} /> Pasado</span>}
            {dayHolidays.length > 0 && (
              <span style={{ fontSize: 9, fontWeight: 500, padding: '2px 7px', borderRadius: 999, background: 'var(--cal-holiday-bg)', color: 'var(--cal-holiday-color)', border: '1px solid var(--cal-holiday-border)' }}>
                🎉 Feriado
              </span>
            )}
          </div>
          <p style={{ fontSize: 11, fontWeight: 300, color: 'var(--cal-text-muted)', marginTop: 2 }}>
            {tasks.length === 0 && dayHolidays.length === 0
              ? 'Sin eventos'
              : `${tasks.length > 0 ? `${tasks.length} tarea${tasks.length !== 1 ? 's' : ''}` : ''}${tasks.length > 0 && dayHolidays.length > 0 ? ' · ' : ''}${dayHolidays.length > 0 ? `${dayHolidays.length} feriado${dayHolidays.length !== 1 ? 's' : ''}` : ''}`}
          </p>
        </div>
        <button className="cal-close-btn" onClick={onClose}>
          <X style={{ width: 13, height: 13 }} strokeWidth={1.5} />
        </button>
      </div>

      <div className="cal-panel-body">
        {/* Holidays first */}
        {dayHolidays.map((h, i) => (
          <div key={i} className="cal-holiday-panel-item">
            <PartyPopper style={{ width: 14, height: 14, color: 'var(--cal-holiday-color)', flexShrink: 0, marginTop: 1 }} strokeWidth={1.5} />
            <div>
              <p style={{ fontSize: 12, fontWeight: 400, color: 'var(--cal-holiday-color)' }}>{h.localName}</p>
              {h.localName !== h.name && (
                <p style={{ fontSize: 10, fontWeight: 300, color: 'var(--cal-text-muted)' }}>{h.name}</p>
              )}
            </div>
          </div>
        ))}

        {/* Tasks */}
        {tasks.length === 0 && dayHolidays.length === 0 ? (
          <div className="cal-empty" style={{ height: 90 }}>
            <ListTodo style={{ width: 20, height: 20, color: 'var(--cal-text-quaternary)' }} strokeWidth={1} />
            <p style={{ fontSize: 11, fontWeight: 300, color: 'var(--cal-text-muted)' }}>
              {past ? 'No hubo tareas' : 'Ninguna tarea'}
            </p>
          </div>
        ) : tasks.length === 0 ? null : tasks.map(task => {
          const pri = PRI[task.priority as keyof typeof PRI] ?? PRI.medium;
          const sta = STA[task.status as keyof typeof STA] ?? STA.pending;
          const assignee = task.assignedToRole
            ? ROLE_CFG[task.assignedToRole]?.label
            : task.assignedTo ? users.find(u => u.uid === task.assignedTo)?.displayName : null;

          return (
            <button key={task.id} type="button" className="cal-task-btn" onClick={() => onTaskClick(task)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', marginTop: 4, flexShrink: 0, background: pri.dot, opacity: task.status === 'completed' ? 0.3 : 1 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 300, color: 'var(--cal-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: task.status === 'completed' ? 'line-through' : 'none', opacity: task.status === 'completed' ? 0.5 : 1 }}>
                    {task.title}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 300, padding: '2px 6px', borderRadius: 5, color: sta.color, background: sta.bg }}>{sta.label}</span>
                    {assignee && <span style={{ fontSize: 10, fontWeight: 300, color: 'var(--cal-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>{assignee}</span>}
                  </div>
                </div>
                <Eye style={{ width: 11, height: 11, color: 'var(--cal-text-muted)', flexShrink: 0, marginTop: 2 }} strokeWidth={1.5} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ── FilterDropdown ────────────────────────────────────────────────────────────
const FilterDropdown: React.FC<{
  filterStatus: FilterStatus; filterPriority: FilterPriority;
  onStatusChange: (v: FilterStatus) => void; onPriorityChange: (v: FilterPriority) => void;
  onClose: () => void;
}> = ({ filterStatus, filterPriority, onStatusChange, onPriorityChange, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} className="cal-filter-dropdown" style={{ padding: 14 }}>
      <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--cal-text-muted)', marginBottom: 8, fontWeight: 400 }}>Estado</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
        {([['all','Todos'], ['pending','Pendiente'], ['in-progress','En progreso'], ['completed','Completada']] as [FilterStatus,string][]).map(([v, l]) => (
          <button key={v} className={`cal-filter-btn ${filterStatus === v ? 'active-filter' : ''}`} onClick={() => onStatusChange(v)}>{l}</button>
        ))}
      </div>
      <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--cal-text-muted)', marginBottom: 8, fontWeight: 400 }}>Prioridad</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {([
          ['all','Todas', undefined],
          ['high','Alta','#f87171'],
          ['medium','Media','#fbbf24'],
          ['low','Baja','#4ade80'],
        ] as [FilterPriority, string, string|undefined][]).map(([v, l, c]) => (
          <button key={v}
            className={`cal-filter-btn ${filterPriority === v ? 'active-filter' : ''}`}
            style={filterPriority === v && c ? { color: c, borderColor: `${c}55`, background: `${c}14` } : undefined}
            onClick={() => onPriorityChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
};

// ── Main CalendarPage ─────────────────────────────────────────────────────────
const CalendarPage: React.FC = () => {
  const { userProfile } = useAuth();
  const { settings, isDark } = useSettings();
  const isCEO = userProfile?.role === 'CEO';

  const accentColor: string = (settings?.accentColor as string) || '#6366f1';

  const [allTasks,       setAllTasks]       = useState<ExtTask[]>([]);
  const [users,          setUsers]          = useState<UserProfile[]>([]);
  const [currentMonth,   setCurrentMonth]   = useState(new Date());
  const [selectedTask,   setSelectedTask]   = useState<ExtTask | null>(null);
  const [dialogOpen,     setDialogOpen]     = useState(false);
  const [panelDay,       setPanelDay]       = useState<Date | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [reportTask,     setReportTask]     = useState<ExtTask | null>(null);
  const [viewMode,       setViewMode]       = useState<ViewMode>('grid');
  const [searchQuery,    setSearchQuery]    = useState('');
  const [filterStatus,   setFilterStatus]   = useState<FilterStatus>('all');
  const [filterPriority, setFilterPriority] = useState<FilterPriority>('all');
  const [showFilter,     setShowFilter]     = useState(false);
  const [mobilePanelOpen,setMobilePanelOpen]= useState(false);

  // ── Holidays state ──
  // ── Detect country once (synchronous, no effect needed) ──
  const [countryCode] = useState<string>(() => detectCountryCode());
  const [holidays,    setHolidays]    = useState<NagerHoliday[]>([]);
  const [loadedYear,  setLoadedYear]  = useState<number | null>(null);

  // ── Inject :root CSS vars whenever theme/accent changes ──
  useEffect(() => {
    injectThemeVars(isDark, accentColor);
    return () => {
      const el = document.getElementById('cal-theme-root-vars');
      if (el) el.remove();
    };
  }, [isDark, accentColor]);

  // ── Fetch functions declared before useEffect that calls them ──
  const fetchTasks = useCallback(async () => {
    try {
      const raw = await getTasks();
      const mapped = raw.map((t: Record<string, unknown>) => ({
        ...t,
        date: (t.date as { toDate?: () => Date } | null)?.toDate?.() ?? new Date(),
      })) as ExtTask[];
      setAllTasks(mapped);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);
  
  const fetchUsers = useCallback(async () => {
    try { setUsers((await getAllUsers()) as UserProfile[]); } catch (e) { console.error(e); }
  }, []);

  // ── Load tasks & users on mount ──
  useEffect(() => { fetchTasks(); fetchUsers(); }, [fetchTasks, fetchUsers]);

  // ── Load holidays when month/year or country changes (async, no sync setState) ──
  useEffect(() => {
    const year = currentMonth.getFullYear();
    if (loadedYear === year) return;
    fetchHolidays(countryCode, year).then(h => {
      setHolidays(h);
      setLoadedYear(year);
    });
  }, [currentMonth, countryCode, loadedYear]);

  const visibleTasks = allTasks.filter(t => canUserSeeTask(t, userProfile));

  const filteredTasks = visibleTasks.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!t.title.toLowerCase().includes(q) && !(t.description ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const days     = eachDayOfInterval({ start: startOfWeek(startOfMonth(currentMonth)), end: endOfWeek(endOfMonth(currentMonth)) });
  const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  const getTasksForDay = (day: Date) =>
    filteredTasks.filter(t => isSameDay(new Date(t.date), day));

  const getHolidaysForDay = (day: Date) =>
    holidays.filter(h => isSameDay(new Date(h.date), day));

  const handleDayClick = (day: Date) => {
    if (!isSameMonth(day, currentMonth)) return;
    const dayTasks    = getTasksForDay(day);
    const dayHolidays = getHolidaysForDay(day);
    if (!isCEO && dayTasks.length === 0 && dayHolidays.length === 0) return;
    if (panelDay && isSameDay(day, panelDay)) { setPanelDay(null); setMobilePanelOpen(false); return; }
    setPanelDay(day);
    setMobilePanelOpen(true);
  };

  const handleTaskClick = (task: ExtTask, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedTask(task); setPanelDay(null); setMobilePanelOpen(false); setDialogOpen(true);
  };

  const handleStatusToggle = async (task: ExtTask, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isCEO) return;
    try {
      await updateTask(task.id, { status: task.status === 'completed' ? 'pending' : 'completed' });
      fetchTasks();
    } catch (err) { console.error(err); }
  };

  const getAssignLabel = (task: ExtTask): string | null => {
    if (task.assignedToRole) return ROLE_CFG[task.assignedToRole]?.label ?? task.assignedToRole;
    if (task.assignedTo)     return users.find(u => u.uid === task.assignedTo)?.displayName ?? null;
    return null;
  };

  const isSearching = searchQuery.trim().length > 0;

  const monthTasks = filteredTasks
    .filter(t => isSearching ? true : isSameMonth(new Date(t.date), currentMonth))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const totalMonth     = visibleTasks.filter(t => isSameMonth(new Date(t.date), currentMonth)).length;
  const completedCount = visibleTasks.filter(t => isSameMonth(new Date(t.date), currentMonth) && t.status === 'completed').length;
  const overdueCount   = visibleTasks.filter(t => isSameMonth(new Date(t.date), currentMonth) && isDayPast(new Date(t.date)) && t.status !== 'completed').length;
  const completionPct  = totalMonth > 0 ? Math.round((completedCount / totalMonth) * 100) : 0;
  const activeFilters  = (filterStatus !== 'all' ? 1 : 0) + (filterPriority !== 'all' ? 1 : 0) + (searchQuery.trim() ? 1 : 0);

  const userCanInteract = selectedTask ? canUserInteract(selectedTask, userProfile) : false;
  const monthHolidays   = holidays.filter(h => isSameMonth(new Date(h.date), currentMonth));

  // Country flag emoji from code
  const countryFlag = (code: string) =>
    code.toUpperCase().replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397));

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 280 }}>
      <div className="cal-spinner" />
    </div>
  );

  const panelTasks    = panelDay ? getTasksForDay(panelDay) : [];
  const panelHolidays = panelDay ? getHolidaysForDay(panelDay) : [];

  return (
    <>
      <style>{CAL_STYLES}</style>
      <div className="cal-root">

        {/* ── Header ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: 'rgba(var(--cal-accent-rgb),0.12)', border: '1px solid rgba(var(--cal-accent-rgb),0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CalendarIcon style={{ width: 16, height: 16, color: 'var(--cal-accent)' }} strokeWidth={1.5} />
            </div>
            <div>
              <h1 style={{ color: 'var(--cal-text-primary)', fontWeight: 300, fontSize: 20, letterSpacing: '-0.02em', lineHeight: 1.2 }}>Calendario</h1>
              <p style={{ fontSize: 11, fontWeight: 300, color: 'var(--cal-text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                {!isCEO && <><Lock style={{ width: 10, height: 10 }} strokeWidth={1.5} /> Tus tareas asignadas · </>}
                <span title={`País detectado: ${countryCode}`}>{countryFlag(countryCode)} Feriados {countryCode}</span>
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* View toggle */}
            <div style={{ display: 'flex', gap: 3 }}>
              <button className={`cal-icon-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')}>
                <LayoutGrid style={{ width: 14, height: 14 }} strokeWidth={1.5} />
              </button>
              <button className={`cal-icon-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>
                <List style={{ width: 14, height: 14 }} strokeWidth={1.5} />
              </button>
            </div>

            {/* Filter */}
            <div style={{ position: 'relative' }}>
              <button className={`cal-icon-btn ${activeFilters > 0 ? 'active' : ''}`} onClick={() => setShowFilter(v => !v)} style={{ position: 'relative' }}>
                <Filter style={{ width: 13, height: 13 }} strokeWidth={1.5} />
                {activeFilters > 0 && (
                  <span style={{ position: 'absolute', top: -3, right: -3, width: 14, height: 14, borderRadius: '50%', background: 'var(--cal-accent)', fontSize: 9, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                    {activeFilters}
                  </span>
                )}
              </button>
              {showFilter && (
                <FilterDropdown
                  filterStatus={filterStatus} filterPriority={filterPriority}
                  onStatusChange={v => setFilterStatus(v)}
                  onPriorityChange={v => setFilterPriority(v)}
                  onClose={() => setShowFilter(false)}
                />
              )}
            </div>

            {/* Month nav */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="cal-nav-btn" onClick={() => { setCurrentMonth(subMonths(currentMonth, 1)); setPanelDay(null); }}>
                <ChevronLeft style={{ width: 14, height: 14 }} strokeWidth={1.5} />
              </button>
              <span className="cal-month-title">
                {format(currentMonth, 'MMMM yyyy', { locale: es })}
              </span>
              <button className="cal-nav-btn" onClick={() => { setCurrentMonth(addMonths(currentMonth, 1)); setPanelDay(null); }}>
                <ChevronRight style={{ width: 14, height: 14 }} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Search ── */}
        <div className="cal-search-wrap">
          <Search style={{ width: 13, height: 13, color: 'var(--cal-text-muted)', flexShrink: 0 }} strokeWidth={1.5} />
          <input
            placeholder="Buscar tareas por título o descripción…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--cal-text-muted)' }}>
              <X style={{ width: 12, height: 12 }} strokeWidth={1.5} />
            </button>
          )}
        </div>

        {/* ── Stats ── */}
        <div className="cal-stats-grid">
          {[
            { label: 'Tareas del mes',              value: totalMonth.toString(),     icon: CalendarIcon,  color: 'var(--cal-accent)' },
            { label: `Completadas (${completionPct}%)`, value: completedCount.toString(), icon: CheckCircle2,  color: '#4ade80' },
            { label: 'Vencidas',                    value: overdueCount.toString(),   icon: AlertCircle,   color: '#f87171' },
          ].map(({ label, value, icon: Icon, color }, i) => (
            <div key={label} className="cal-stat-card" style={{ animationDelay: `${i * 0.04}s` }}>
              <Icon size={15} style={{ color, margin: '0 auto 5px' }} strokeWidth={1.5} />
              <div style={{ fontSize: 20, fontWeight: 200, color: 'var(--cal-text-primary)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
              <div style={{ fontSize: 9, color: 'var(--cal-text-muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
              {i === 1 && totalMonth > 0 && (
                <div className="cal-progress-bar">
                  <div className="cal-progress-fill" style={{ width: `${completionPct}%`, background: '#4ade80' }} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Holiday summary strip (if any this month) ── */}
        {monthHolidays.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
            <PartyPopper style={{ width: 13, height: 13, color: 'var(--cal-holiday-color)', flexShrink: 0 }} strokeWidth={1.5} />
            <span style={{ fontSize: 11, fontWeight: 300, color: 'var(--cal-text-muted)', flexShrink: 0 }}>Feriados:</span>
            {monthHolidays.map((h, i) => (
              <span key={i} style={{ fontSize: 11, fontWeight: 300, padding: '3px 8px', borderRadius: 999, background: 'var(--cal-holiday-bg)', color: 'var(--cal-holiday-color)', border: '1px solid var(--cal-holiday-border)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {format(new Date(h.date), "d 'de' MMM", { locale: es })} – {h.localName}
              </span>
            ))}
          </div>
        )}

        {/* ── Grid view ── */}
        {viewMode === 'grid' && (
          <>
            <div className="cal-desktop-layout" style={{ display: 'flex' }}>
              <div className="cal-grid-wrap" style={{ flex: 1, minWidth: 0 }}>
                <div style={{ padding: 12 }}>
                  <div className="cal-grid-inner" style={{ marginBottom: 6 }}>
                    {weekDays.map(d => <div key={d} className="cal-weekday">{d}</div>)}
                  </div>
                  <div className="cal-grid-inner">
                    {days.map((day, i) => {
                      const dayTasks    = getTasksForDay(day);
                      const dayHolidays = getHolidaysForDay(day);
                      const inMonth     = isSameMonth(day, currentMonth);
                      const today       = isToday(day);
                      const past        = isDayPast(day);
                      const isSelected  = panelDay ? isSameDay(day, panelDay) : false;
                      const isHoliday   = dayHolidays.length > 0 && inMonth;
                      const clickable   = inMonth && (isCEO || dayTasks.length > 0 || dayHolidays.length > 0);

                      return (
                        <div key={i}
                          className={[
                            'cal-day',
                            !inMonth ? 'other-month' : '',
                            isSelected ? 'selected' : '',
                            clickable ? 'clickable' : '',
                            isHoliday ? 'is-holiday' : '',
                          ].filter(Boolean).join(' ')}
                          style={{ opacity: past && inMonth ? 0.65 : undefined }}
                          onClick={() => clickable && handleDayClick(day)}
                        >
                          <div className={['cal-day-num', today ? 'today' : '', past ? 'past' : ''].filter(Boolean).join(' ')}>
                            {format(day, 'd')}
                          </div>

                          {/* Holiday indicator */}
                          {isHoliday && (
                            <div style={{ marginBottom: 2 }}>
                              <span className="cal-holiday-dot" />
                              <span className="cal-holiday-label">{dayHolidays[0].localName}</span>
                            </div>
                          )}

                          {/* Task chips */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {dayTasks.slice(0, isHoliday ? 1 : 2).map(task => {
                              const pri = PRI[task.priority as keyof typeof PRI] ?? PRI.medium;
                              return (
                                <div key={task.id} className="cal-task-chip" title={task.title}
                                  style={{
                                    background: task.status === 'completed' ? 'rgba(74,222,128,0.12)' : pri.bg,
                                    color: task.status === 'completed' ? '#4ade80' : pri.color,
                                    textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                                  }}>
                                  {task.title}
                                </div>
                              );
                            })}
                            {dayTasks.length > (isHoliday ? 1 : 2) && (
                              <div style={{ fontSize: 9, fontWeight: 300, padding: '0 3px', color: 'var(--cal-text-muted)' }}>
                                +{dayTasks.length - (isHoliday ? 1 : 2)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Desktop side panel */}
              {panelDay && (
                <div className="cal-desktop-panel">
                  <DayPanel
                    day={panelDay} tasks={panelTasks} users={users} holidays={panelHolidays}
                    onTaskClick={handleTaskClick}
                    onClose={() => { setPanelDay(null); setMobilePanelOpen(false); }}
                  />
                </div>
              )}
            </div>

            {/* Mobile panel (below grid) */}
            {panelDay && mobilePanelOpen && (
              <div className="cal-mobile-panel">
                <DayPanel
                  day={panelDay} tasks={panelTasks} users={users} holidays={panelHolidays}
                  onTaskClick={handleTaskClick}
                  onClose={() => { setPanelDay(null); setMobilePanelOpen(false); }}
                />
              </div>
            )}
          </>
        )}

        {/* ── Month task list ── */}
        <div className="cal-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderBottom: '1px solid var(--cal-border)' }}>
            <span style={{ fontSize: 13, fontWeight: 300, color: 'var(--cal-text-primary)' }}>
              {isSearching ? 'Resultados de búsqueda (todos los meses)' : viewMode === 'list' ? 'Todas las tareas' : 'Tareas del mes'}
            </span>
            <span style={{ fontSize: 12, fontWeight: 300, color: 'var(--cal-text-muted)' }}>
              {monthTasks.length} tarea{monthTasks.length !== 1 ? 's' : ''}
              {activeFilters > 0 && <span style={{ fontSize: 10, color: 'var(--cal-accent)', marginLeft: 5 }}>· Filtradas</span>}
            </span>
          </div>
          <div style={{ padding: 10 }}>
            {monthTasks.length === 0 ? (
              <div className="cal-empty" style={{ padding: '36px 0' }}>
                <CalendarIcon style={{ width: 26, height: 26, color: 'var(--cal-text-quaternary)' }} strokeWidth={1} />
                <p style={{ fontSize: 13, fontWeight: 300, color: 'var(--cal-text-muted)' }}>
                  {isSearching ? `Sin resultados para "${searchQuery}"` : activeFilters > 0 ? 'Sin resultados para los filtros activos' : isCEO ? 'No hay tareas programadas' : 'No tienes tareas asignadas este mes'}
                </p>
                {activeFilters > 0 && (
                  <button className="cal-accent-btn" onClick={() => { setFilterStatus('all'); setFilterPriority('all'); setSearchQuery(''); }} style={{ marginTop: 4 }}>
                    Limpiar filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="cal-list-rows" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {monthTasks.map(task => {
                  const pri         = PRI[task.priority as keyof typeof PRI] ?? PRI.medium;
                  const sta         = STA[task.status as keyof typeof STA] ?? STA.pending;
                  const assignLabel = getAssignLabel(task);
                  const past        = isDayPast(new Date(task.date));
                  const isOverdue   = past && task.status !== 'completed';
                  const taskHoliday = getHolidaysForDay(new Date(task.date));

                  return (
                    <div key={task.id} className="cal-list-row" style={{ opacity: past && !isOverdue ? 0.6 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                        {isCEO && !past ? (
                          <button className="cal-status-btn" onClick={e => handleStatusToggle(task, e)}
                            style={{ color: task.status === 'completed' ? '#4ade80' : 'var(--cal-text-quaternary)' }}>
                            <CheckCircle2 style={{ width: 18, height: 18 }} strokeWidth={1.5} />
                          </button>
                        ) : (
                          <CheckCircle2 style={{ width: 18, height: 18, flexShrink: 0 }} strokeWidth={1.5}
                            color={task.status === 'completed' ? '#4ade80' : 'var(--cal-text-quaternary)'} />
                        )}
                        <div style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: pri.dot }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <p style={{ fontSize: 13, fontWeight: 300, color: 'var(--cal-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: task.status === 'completed' ? 'line-through' : 'none', opacity: task.status === 'completed' ? 0.5 : 1 }}>
                              {task.title}
                            </p>
                            {isOverdue && <span className="cal-badge-overdue">Vencida</span>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2, flexWrap: 'wrap' }}>
                            <p style={{ fontSize: 11, fontWeight: 300, color: 'var(--cal-text-muted)' }}>
                              {format(new Date(task.date), isSearching ? "d 'de' MMMM yyyy" : "d 'de' MMMM", { locale: es })}
                            </p>
                            {taskHoliday.length > 0 && (
                              <span style={{ fontSize: 10, color: 'var(--cal-holiday-color)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                · 🎉 {taskHoliday[0].localName}
                              </span>
                            )}
                            {assignLabel && (
                              <span className="cal-list-assignee" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ color: 'var(--cal-border)', fontSize: 10 }}>·</span>
                                <p style={{ fontSize: 11, fontWeight: 300, color: 'var(--cal-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{assignLabel}</p>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, marginLeft: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 300, padding: '3px 7px', borderRadius: 999, color: sta.color, background: sta.bg, whiteSpace: 'nowrap' }}>
                          {sta.label}
                        </span>
                        <button className="cal-view-btn" onClick={e => handleTaskClick(task, e)}>Ver →</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Task detail dialog ── */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="cal-dialog-box" style={{ maxWidth: 480 }}>
            <DialogHeader>
              <DialogTitle style={{ fontWeight: 300, fontSize: 14, color: 'var(--cal-dialog-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <CalendarIcon style={{ width: 15, height: 15, color: 'var(--cal-text-muted)' }} strokeWidth={1.5} />
                Detalle de tarea
              </DialogTitle>
            </DialogHeader>

            {selectedTask ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <ReadOnlyTaskView task={selectedTask} users={users} isCEO={isCEO} />

                {userCanInteract && (
                  <div style={{ paddingTop: 12, borderTop: '1px solid var(--cal-border)' }}>
                    <button type="button" className="cal-report-btn"
                      onClick={() => { setDialogOpen(false); setReportTask(selectedTask); }}>
                      <CheckCircle2 style={{ width: 15, height: 15, color: '#4ade80' }} strokeWidth={1.5} />
                      Reportar estado
                    </button>
                  </div>
                )}

                {!userCanInteract && !isCEO && (
                  <div style={{ paddingTop: 12, borderTop: '1px solid var(--cal-border)' }}>
                    <div className="cal-no-interact">
                      <ShieldCheck style={{ width: 13, height: 13, flexShrink: 0, color: 'var(--cal-text-muted)' }} strokeWidth={1.5} />
                      <p style={{ fontSize: 12, fontWeight: 300, color: 'var(--cal-text-muted)' }}>Esta tarea no está asignada a ti.</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ fontSize: 13, fontWeight: 300, textAlign: 'center', padding: '16px 0', color: 'var(--cal-text-muted)' }}>No se encontró la tarea.</p>
            )}
          </DialogContent>
        </Dialog>

        {reportTask && userProfile && (
          <TaskReportDialog
            open={!!reportTask}
            onClose={() => setReportTask(null)}
            task={reportTask}
            userProfile={userProfile}
          />
        )}
      </div>
    </>
  );
};

export default CalendarPage;