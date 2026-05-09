import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getTasks, updateTask, getAllUsers } from '@/lib/firebase';
import TaskReportDialog from '@/components/TaskReportDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  CheckCircle2, Flag, Calendar as CalendarIcon,
  AlignLeft, Clock, ChevronLeft, ChevronRight, Lock,
  UserCheck, UsersRound, Eye, Ban, ListTodo, X,
} from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameMonth, isSameDay, addMonths, subMonths,
  startOfWeek, endOfWeek, isPast, isToday, startOfDay,
} from 'date-fns';
import { es } from 'date-fns/locale';
import type { Task, UserProfile, UserRole } from '@/types';

const isDayPast = (day: Date) => isPast(startOfDay(day)) && !isToday(day);

const PRIORITY_CONFIG = {
  high:   { label: 'Alta',  color: '#f87171', bg: 'rgba(248,113,113,0.1)',  dot: '#f87171',  calBg: 'rgba(248,113,113,0.08)'  },
  medium: { label: 'Media', color: '#facc15', bg: 'rgba(250,204,21,0.1)',   dot: '#facc15',  calBg: 'rgba(250,204,21,0.08)'   },
  low:    { label: 'Baja',  color: '#4ade80', bg: 'rgba(74,222,128,0.1)',   dot: '#4ade80',  calBg: 'rgba(74,222,128,0.08)'   },
};
const STATUS_CONFIG = {
  pending:       { label: 'Pendiente',   color: '#94a3b8', bg: 'rgba(148,163,184,0.08)' },
  'in-progress': { label: 'En progreso', color: '#60a5fa', bg: 'rgba(96,165,250,0.08)'  },
  completed:     { label: 'Completada',  color: '#4ade80', bg: 'rgba(74,222,128,0.08)'  },
};
const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
  CEO:            { label: 'CEO',            color: '#c084fc' },
  Administración: { label: 'Administración', color: '#60a5fa' },
  Empleado:       { label: 'Empleado',       color: '#94a3b8' },
};

const bd = 'hsl(var(--border))';
const sf = 'hsl(var(--card))';

// ── ReadOnlyTaskView ─────────────────────────────────────────────────────────
const ReadOnlyTaskView: React.FC<{ task: Task; users: UserProfile[] }> = ({ task, users }) => {
  const pri = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;
  const sta = STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
  const t   = task as any;
  const assignedUser = t.assignedTo ? users.find(u => u.uid === t.assignedTo) ?? null : null;
  const assignedRole = t.assignedToRole as UserRole | null;
  const roleCfg = assignedRole ? ROLE_CONFIG[assignedRole] : null;

  return (
    <div className="space-y-4 py-1">
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
        style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${bd}` }}>
        <Lock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }} />
        <p className="text-xs font-light" style={{ color: 'hsl(var(--muted-foreground))' }}>Solo el CEO puede modificar tareas.</p>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-widest font-light mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Título</p>
        <p className="text-white font-light text-lg leading-snug">{task.title}</p>
      </div>

      {task.description && (
        <div>
          <p className="text-[10px] uppercase tracking-widest font-light mb-1.5 flex items-center gap-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            <AlignLeft className="w-3 h-3" /> Descripción
          </p>
          <p className="text-sm font-light leading-relaxed p-3 rounded-xl whitespace-pre-wrap"
            style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${bd}`, color: 'rgba(255,255,255,0.7)' }}>
            {task.description}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest font-light mb-1.5 flex items-center gap-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
            <Flag className="w-3 h-3" /> Prioridad
          </p>
          <span className="inline-flex items-center gap-1.5 text-sm font-light px-3 py-1.5 rounded-xl"
            style={{ background: pri.bg, color: pri.color }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: pri.color }} />{pri.label}
          </span>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest font-light mb-1.5 flex items-center gap-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
            <Clock className="w-3 h-3" /> Estado
          </p>
          <span className="inline-flex items-center gap-1.5 text-sm font-light px-3 py-1.5 rounded-xl"
            style={{ background: sta.bg, color: sta.color }}>
            {sta.label}
          </span>
        </div>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-widest font-light mb-1.5 flex items-center gap-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
          <CalendarIcon className="w-3 h-3" /> Fecha límite
        </p>
        <p className="text-sm font-light" style={{ color: 'rgba(255,255,255,0.7)' }}>
          {format(new Date(task.date), "d 'de' MMMM yyyy", { locale: es })}
        </p>
      </div>

      {assignedUser && (
        <div>
          <p className="text-[10px] uppercase tracking-widest font-light mb-1.5 flex items-center gap-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
            <UserCheck className="w-3 h-3" /> Asignado a
          </p>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl w-fit"
            style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${bd}` }}>
            <div className="w-6 h-6 rounded-lg bg-zinc-700 flex items-center justify-center">
              <span className="text-white text-xs font-light">{assignedUser.displayName?.[0]?.toUpperCase() ?? '?'}</span>
            </div>
            <div>
              <p className="text-sm font-light text-white">{assignedUser.displayName}</p>
              <p className="text-[11px] font-light" style={{ color: 'hsl(var(--muted-foreground))' }}>{assignedUser.email}</p>
            </div>
          </div>
        </div>
      )}

      {!assignedUser && assignedRole && roleCfg && (
        <div>
          <p className="text-[10px] uppercase tracking-widest font-light mb-1.5 flex items-center gap-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
            <UsersRound className="w-3 h-3" /> Rol asignado
          </p>
          <span className="inline-flex items-center gap-1.5 text-sm font-light px-3 py-1.5 rounded-xl"
            style={{ background: `${roleCfg.color}15`, color: roleCfg.color }}>
            <UsersRound className="w-3 h-3" />{roleCfg.label}
          </span>
        </div>
      )}
    </div>
  );
};

// ── DayPanel ─────────────────────────────────────────────────────────────────
const DayPanel: React.FC<{
  day: Date; tasks: Task[]; users: UserProfile[];
  onTaskClick: (task: Task) => void; onClose: () => void;
}> = ({ day, tasks, users, onTaskClick, onClose }) => {
  const past  = isDayPast(day);
  const today = isToday(day);
  return (
    <div className="w-72 flex-shrink-0 flex flex-col rounded-2xl overflow-hidden"
      style={{ background: sf, border: `1px solid ${bd}`, animation: 'dpIn 0.22s cubic-bezier(0.22,1,0.36,1)' }}>
      <div className="flex items-start justify-between px-4 py-3.5 border-b flex-shrink-0" style={{ borderColor: bd }}>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-white font-light text-sm capitalize">
              {today ? 'Hoy' : format(day, "EEEE d MMM", { locale: es })}
            </p>
            {today && <span className="text-[9px] font-light px-1.5 py-0.5 rounded-full bg-white/[0.08] text-white/50 border border-white/10">HOY</span>}
            {past && <span className="flex items-center gap-1 text-[9px] font-light px-1.5 py-0.5 rounded-full" style={{ color: 'hsl(var(--muted-foreground))', background: 'rgba(255,255,255,0.04)' }}><Ban className="w-2.5 h-2.5" /> Pasado</span>}
          </div>
          <p className="text-xs font-light mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {tasks.length === 0 ? 'Sin tareas' : `${tasks.length} tarea${tasks.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={onClose} className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors hover:bg-white/[0.06]"
          style={{ color: 'hsl(var(--muted-foreground))' }}>
          <X className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5 min-h-[120px]">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 gap-2">
            <ListTodo className="w-6 h-6" style={{ color: 'rgba(255,255,255,0.1)' }} strokeWidth={1} />
            <p className="text-xs font-light" style={{ color: 'hsl(var(--muted-foreground))' }}>{past ? 'No hubo tareas' : 'Ninguna tarea'}</p>
          </div>
        ) : tasks.map(task => {
          const pri = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;
          const sta = STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
          const t = task as any;
          const assignee = t.assignedToRole
            ? ROLE_CONFIG[t.assignedToRole as UserRole]?.label
            : t.assignedTo ? users.find(u => u.uid === t.assignedTo)?.displayName : null;
          return (
            <button key={task.id} type="button" onClick={() => onTaskClick(task)}
              className="w-full text-left group px-3 py-2.5 rounded-xl transition-all hover:bg-white/[0.04]"
              style={{ border: `1px solid ${bd}` }}>
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                  style={{ background: pri.dot, opacity: task.status === 'completed' ? 0.3 : 1 }} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-light truncate ${task.status === 'completed' ? 'line-through opacity-50' : 'text-white'}`}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] font-light px-1.5 py-0.5 rounded-md" style={{ color: sta.color, background: sta.bg }}>{sta.label}</span>
                    {assignee && <span className="text-[10px] font-light truncate max-w-[80px]" style={{ color: 'hsl(var(--muted-foreground))' }}>{assignee}</span>}
                  </div>
                </div>
                <Eye className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" style={{ color: 'hsl(var(--muted-foreground))' }} strokeWidth={1.5} />
              </div>
            </button>
          );
        })}
      </div>
      <style>{`@keyframes dpIn { from{opacity:0;transform:translateX(8px) scale(0.98)} to{opacity:1;transform:none} }`}</style>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
const CalendarPage: React.FC = () => {
  const { userProfile } = useAuth();
  const isCEO = userProfile?.role === 'CEO';

  const [tasks,        setTasks]        = useState<Task[]>([]);
  const [users,        setUsers]        = useState<UserProfile[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [dialogOpen,   setDialogOpen]   = useState(false);
  const [panelDay,     setPanelDay]     = useState<Date | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [reportTask,   setReportTask]   = useState<Task | null>(null);

  useEffect(() => { fetchTasks(); fetchUsers(); }, []);

  const fetchTasks = async () => {
    try { setTasks((await getTasks()).map((t: any) => ({ ...t, date: t.date?.toDate() || new Date() })) as Task[]); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  const fetchUsers = async () => {
    try { setUsers((await getAllUsers()) as UserProfile[]); } catch (e) { console.error(e); }
  };

  const days     = eachDayOfInterval({ start: startOfWeek(startOfMonth(currentMonth)), end: endOfWeek(endOfMonth(currentMonth)) });
  const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  const getTasksForDay = (day: Date) => tasks.filter(t => isSameDay(new Date(t.date), day));

  const handleDayClick = (day: Date) => {
    if (!isSameMonth(day, currentMonth)) return;
    const dayTasks = getTasksForDay(day);
    if (!isCEO && dayTasks.length === 0) return;
    if (panelDay && isSameDay(day, panelDay)) { setPanelDay(null); return; }
    setPanelDay(day);
  };

  const handleTaskClick = (task: Task, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedTask(task); setPanelDay(null); setDialogOpen(true);
  };

  const handleStatusToggle = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isCEO) return;
    try { await updateTask(task.id, { status: task.status === 'completed' ? 'pending' : 'completed' }); fetchTasks(); }
    catch (e) { console.error(e); }
  };

  const getAssignLabel = (task: any): string | null => {
    if (task.assignedToRole) return `Rol: ${ROLE_CONFIG[task.assignedToRole as UserRole]?.label ?? task.assignedToRole}`;
    if (task.assignedTo)     return users.find(u => u.uid === task.assignedTo)?.displayName ?? null;
    return null;
  };

  const monthTasks = tasks
    .filter(t => isSameMonth(new Date(t.date), currentMonth))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-7 h-7 border border-zinc-700 border-t-zinc-300 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}>
              <CalendarIcon className="w-4 h-4" style={{ color: '#60a5fa' }} strokeWidth={1.5} />
            </div>
            <h1 className="text-xl font-light text-white tracking-tight">Calendario</h1>
          </div>
          {!isCEO && (
            <p className="text-xs font-light flex items-center gap-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <Lock className="w-3 h-3" /> Solo visualización
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setCurrentMonth(subMonths(currentMonth, 1)); setPanelDay(null); }}
            className="w-9 h-9 rounded-xl flex items-center justify-center border transition-all hover:bg-white/[0.05]"
            style={{ borderColor: bd, color: 'white' }}>
            <ChevronLeft className="w-4 h-4" strokeWidth={1.5} />
          </button>
          <span className="text-white font-light text-sm min-w-[160px] text-center capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: es })}
          </span>
          <button onClick={() => { setCurrentMonth(addMonths(currentMonth, 1)); setPanelDay(null); }}
            className="w-9 h-9 rounded-xl flex items-center justify-center border transition-all hover:bg-white/[0.05]"
            style={{ borderColor: bd, color: 'white' }}>
            <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Calendar + Side panel */}
      <div className="flex gap-4 items-start flex-wrap lg:flex-nowrap">
        {/* Grid */}
        <div className="flex-1 min-w-0 rounded-2xl overflow-hidden border" style={{ background: sf, borderColor: bd }}>
          <div className="p-4">
            <div className="grid grid-cols-7 gap-1 mb-2">
              {weekDays.map(d => (
                <div key={d} className="text-center text-[10px] font-light uppercase tracking-widest py-2"
                  style={{ color: 'hsl(var(--muted-foreground))' }}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, index) => {
                const dayTasks       = getTasksForDay(day);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const today          = isToday(day);
                const past           = isDayPast(day);
                const isSelected     = panelDay ? isSameDay(day, panelDay) : false;
                const clickable      = isCurrentMonth && (isCEO || dayTasks.length > 0);

                return (
                  <div key={index}
                    onClick={() => clickable && handleDayClick(day)}
                    className="min-h-[72px] md:min-h-[88px] p-1.5 rounded-xl transition-all duration-150 select-none"
                    style={{
                      background:  isSelected ? 'rgba(255,255,255,0.08)' : isCurrentMonth ? 'rgba(255,255,255,0.02)' : 'transparent',
                      border:      `1px solid ${isSelected ? 'rgba(255,255,255,0.15)' : bd}`,
                      opacity:     isCurrentMonth ? 1 : 0.25,
                      cursor:      clickable ? 'pointer' : 'default',
                      boxShadow:   isSelected ? '0 0 0 1px rgba(255,255,255,0.08)' : 'none',
                    }}>
                    <div className={`text-xs font-light mb-1 w-6 h-6 flex items-center justify-center rounded-full mx-auto
                      ${today ? 'bg-white text-black font-medium' : past ? 'text-zinc-700' : 'text-zinc-400'}`}>
                      {format(day, 'd')}
                    </div>
                    <div className="space-y-0.5">
                      {dayTasks.slice(0, 2).map(task => {
                        const pri = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;
                        return (
                          <div key={task.id} title={task.title}
                            className="text-[9px] px-1.5 py-0.5 rounded-md truncate font-light leading-tight"
                            style={{
                              background: task.status === 'completed' ? 'rgba(74,222,128,0.08)' : pri.calBg,
                              color:      task.status === 'completed' ? '#4ade80' : pri.color,
                              opacity:    past ? 0.5 : 1,
                              textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                            }}>
                            {task.title}
                          </div>
                        );
                      })}
                      {dayTasks.length > 2 && (
                        <div className="text-[9px] font-light px-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          +{dayTasks.length - 2}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {panelDay && (
          <DayPanel
            day={panelDay}
            tasks={getTasksForDay(panelDay)}
            users={users}
            onTaskClick={handleTaskClick}
            onClose={() => setPanelDay(null)}
          />
        )}
      </div>

      {/* Month task list */}
      <div className="rounded-2xl overflow-hidden border" style={{ background: sf, borderColor: bd }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: bd }}>
          <span className="text-sm font-light text-white">Tareas del mes</span>
          <span className="text-xs font-light" style={{ color: 'hsl(var(--muted-foreground))' }}>{monthTasks.length} tarea{monthTasks.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="p-3">
          {monthTasks.length === 0 ? (
            <div className="py-10 text-center">
              <CalendarIcon className="w-8 h-8 mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.1)' }} strokeWidth={1} />
              <p className="text-sm font-light" style={{ color: 'hsl(var(--muted-foreground))' }}>No hay tareas programadas</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {monthTasks.map(task => {
                const pri         = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;
                const sta         = STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
                const assignLabel = getAssignLabel(task);
                const past        = isDayPast(new Date(task.date));
                return (
                  <div key={task.id}
                    className="flex items-center justify-between p-3 rounded-xl group transition-all hover:bg-white/[0.03]"
                    style={{ opacity: past ? 0.6 : 1 }}>
                    <div className="flex items-center gap-3 min-w-0">
                      {isCEO && !past ? (
                        <button onClick={e => handleStatusToggle(task, e)}
                          className="transition-colors flex-shrink-0"
                          style={{ color: task.status === 'completed' ? '#4ade80' : 'rgba(255,255,255,0.15)' }}
                          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#4ade80'}
                          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = task.status === 'completed' ? '#4ade80' : 'rgba(255,255,255,0.15)'}>
                          <CheckCircle2 className="w-5 h-5" strokeWidth={1.5} />
                        </button>
                      ) : (
                        <CheckCircle2 className="w-5 h-5 flex-shrink-0"
                          style={{ color: task.status === 'completed' ? '#4ade80' : 'rgba(255,255,255,0.1)' }} strokeWidth={1.5} />
                      )}
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: pri.dot }} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-light truncate ${task.status === 'completed' ? 'line-through opacity-50' : 'text-white'}`}>
                            {task.title}
                          </p>
                          {past && task.status !== 'completed' && (
                            <span className="text-[10px] font-light px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>Vencida</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[11px] font-light" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            {format(new Date(task.date), "d 'de' MMMM", { locale: es })}
                          </p>
                          {assignLabel && <>
                            <span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
                            <p className="text-[11px] font-light truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>{assignLabel}</p>
                          </>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className="hidden sm:inline-flex text-[10px] font-light px-2 py-0.5 rounded-full"
                        style={{ color: sta.color, background: sta.bg }}>
                        {sta.label}
                      </span>
                      <button onClick={e => handleTaskClick(task, e)}
                        className="text-xs font-light transition-all opacity-0 group-hover:opacity-100 px-2.5 py-1 rounded-lg hover:bg-white/[0.06]"
                        style={{ color: 'hsl(var(--muted-foreground))' }}>
                        Ver →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Task detail dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent style={{ background: sf, border: `1px solid ${bd}`, borderRadius: '20px', maxWidth: '480px' }}>
          <DialogHeader>
            <DialogTitle className="text-white font-light flex items-center gap-2 text-base">
              <CalendarIcon className="w-4 h-4" style={{ color: 'hsl(var(--muted-foreground))' }} strokeWidth={1.5} />
              Detalle de tarea
            </DialogTitle>
          </DialogHeader>
          {selectedTask ? (
            <div className="space-y-4">
              <ReadOnlyTaskView task={selectedTask} users={users} />
              <div className="pt-3 border-t" style={{ borderColor: bd }}>
                <button type="button" onClick={() => { setDialogOpen(false); setReportTask(selectedTask); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-light transition-all hover:bg-white/[0.06]"
                  style={{ border: `1px solid ${bd}`, color: 'white' }}>
                  <CheckCircle2 className="w-4 h-4" style={{ color: 'hsl(var(--muted-foreground))' }} strokeWidth={1.5} />
                  Reportar estado
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm font-light text-center py-4" style={{ color: 'hsl(var(--muted-foreground))' }}>No se encontró la tarea.</p>
          )}
        </DialogContent>
      </Dialog>

      {reportTask && userProfile && (
        <TaskReportDialog open={!!reportTask} onClose={() => setReportTask(null)} task={reportTask} userProfile={userProfile} />
      )}
    </div>
  );
};

export default CalendarPage;