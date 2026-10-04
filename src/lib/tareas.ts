/**
 * tareas.ts — lo que comparten el gestor de tareas (Panel CEO, Mis tareas),
 * el Inicio y el Calendario.
 *
 * Firestore `tasks/{id}`: title, description, priority, status, date
 * (Timestamp de la fecha límite, a las 12:00 locales), assignedTo (uid) o
 * assignedToRole (rol), createdBy, createdByName, createdAt, updatedAt.
 * Solo CEO y Administración escriben tareas (reglas); el resto informa su
 * avance con un reporte (`taskReports`) y el CEO lo confirma.
 */
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserProfile, UserRole } from '@/types';

export type EstadoTarea    = 'pending' | 'in-progress' | 'completed';
export type PrioridadTarea = 'low' | 'medium' | 'high';

export interface Tarea {
  id:             string;
  title:          string;
  description:    string;
  priority:       PrioridadTarea;
  status:         EstadoTarea;
  /** Fecha límite (null si la tarea no tiene una válida). */
  fecha:          Date | null;
  assignedTo:     string | null;
  assignedToRole: UserRole | null;
  createdBy:      string;
  createdByName:  string;
  creada:         Date | null;
  actualizada:    Date | null;
}

export const ESTADOS: Record<EstadoTarea, { label: string; color: string }> = {
  pending:       { label: 'Pendiente',   color: '#fb923c' },
  'in-progress': { label: 'En progreso', color: '#60a5fa' },
  completed:     { label: 'Completada',  color: '#34d399' },
};

export const PRIORIDADES: Record<PrioridadTarea, { label: string; color: string; peso: number }> = {
  high:   { label: 'Alta',  color: '#f87171', peso: 3 },
  medium: { label: 'Media', color: '#fbbf24', peso: 2 },
  low:    { label: 'Baja',  color: '#34d399', peso: 1 },
};

export const ESTADOS_REPORTE: Record<string, { label: string; color: string }> = {
  completed:       { label: 'Completada',    color: '#34d399' },
  'in-progress':   { label: 'En desarrollo', color: '#60a5fa' },
  'not-completed': { label: 'No completada', color: '#f87171' },
};

const aFecha = (v: unknown): Date | null => {
  if (!v) return null;
  const d = typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate: unknown }).toDate === 'function'
    ? (v as { toDate: () => Date }).toDate()
    : v instanceof Date ? v : new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Normaliza un documento de `tasks` (los viejos traen campos sueltos o nulos). */
export function aTarea(raw: Record<string, unknown>): Tarea {
  const prioridad = String(raw.priority ?? 'medium');
  const estado    = String(raw.status ?? 'pending');
  return {
    id:             String(raw.id ?? ''),
    title:          String(raw.title ?? '').trim() || 'Sin título',
    description:    String(raw.description ?? ''),
    priority:       (prioridad in PRIORIDADES ? prioridad : 'medium') as PrioridadTarea,
    status:         (estado in ESTADOS ? estado : 'pending') as EstadoTarea,
    fecha:          aFecha(raw.date ?? raw.dueDate),
    assignedTo:     raw.assignedTo ? String(raw.assignedTo) : null,
    assignedToRole: raw.assignedToRole ? String(raw.assignedToRole) as UserRole : null,
    createdBy:      String(raw.createdBy ?? ''),
    createdByName:  String(raw.createdByName ?? ''),
    creada:         aFecha(raw.createdAt),
    actualizada:    aFecha(raw.updatedAt),
  };
}

/** 'yyyy-MM-dd' en hora local (toISOString daba el día anterior por la noche en Perú). */
export const aInputFecha = (d: Date | null): string => {
  if (!d) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** La fecha límite se guarda a mediodía local: así ningún huso la corre de día. */
export const deInputFecha = (s: string) => Timestamp.fromDate(new Date(`${s}T12:00:00`));

const inicioDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export type Plazo = 'vencida' | 'hoy' | 'pronto' | 'normal' | 'sin-fecha' | 'completada';

/** Cómo va la tarea respecto de su fecha límite. `dias` < 0 si ya pasó. */
export function plazo(t: Pick<Tarea, 'fecha' | 'status'>, ahora = new Date()): { tipo: Plazo; dias: number; texto: string; color: string } {
  if (t.status === 'completed') return { tipo: 'completada', dias: 0, texto: 'Completada', color: ESTADOS.completed.color };
  if (!t.fecha) return { tipo: 'sin-fecha', dias: 0, texto: 'Sin fecha', color: 'var(--text-muted)' };
  const dias = Math.round((inicioDia(t.fecha).getTime() - inicioDia(ahora).getTime()) / 86_400_000);
  if (dias < 0)  return { tipo: 'vencida', dias, texto: dias === -1 ? 'Venció ayer' : `Venció hace ${-dias} días`, color: '#f87171' };
  if (dias === 0) return { tipo: 'hoy', dias, texto: 'Vence hoy', color: '#fbbf24' };
  if (dias <= 3)  return { tipo: 'pronto', dias, texto: dias === 1 ? 'Vence mañana' : `Vence en ${dias} días`, color: '#fbbf24' };
  return { tipo: 'normal', dias, texto: `En ${dias} días`, color: 'var(--text-muted)' };
}

export const fechaCorta = (d: Date | null) =>
  d ? d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) : '—';

/** CEO y Administración crean, editan y confirman tareas (igual que las reglas). */
export const esGestorTareas = (rol: string | null | undefined) => rol === 'CEO' || rol === 'Administración';

/** Quién ve una tarea: la asignada a él, a su rol, o la que es para todo el equipo. */
export function esParaMi(t: Pick<Tarea, 'assignedTo' | 'assignedToRole'>, perfil: Pick<UserProfile, 'uid' | 'role'> | null | undefined): boolean {
  if (!perfil) return false;
  if (t.assignedTo) return t.assignedTo === perfil.uid;
  if (t.assignedToRole) return t.assignedToRole === perfil.role;
  return true;
}

/** Destinatarios de una tarea (sin quien la creó). */
export function destinatarios(t: Pick<Tarea, 'assignedTo' | 'assignedToRole'>, usuarios: Pick<UserProfile, 'uid' | 'role'>[], excepto?: string): string[] {
  const uids = t.assignedTo ? [t.assignedTo]
    : t.assignedToRole ? usuarios.filter(u => u.role === t.assignedToRole).map(u => u.uid)
    : usuarios.map(u => u.uid);
  return [...new Set(uids)].filter(u => u && u !== excepto);
}

export type TipoAvisoTarea = 'task-assigned' | 'task-status' | 'task-report';

/**
 * Aviso en la campana (colección `notifications`, la misma de las menciones).
 * Es secundario: si falla, la acción ya se hizo y solo se registra el error.
 */
export async function avisarTarea(tipo: TipoAvisoTarea, para: string[], datos: {
  taskId: string; taskTitle: string; autorUid?: string; autorNombre?: string; estado?: string;
}) {
  const toUids = [...new Set(para)].filter(Boolean).slice(0, 200);
  if (toUids.length === 0) return;
  try {
    await addDoc(collection(db, 'notifications'), {
      type: tipo, toUids, taskId: datos.taskId, taskTitle: datos.taskTitle,
      authorUid: datos.autorUid ?? '', authorName: datos.autorNombre ?? '',
      ...(datos.estado ? { estado: datos.estado } : {}),
      createdAt: Timestamp.now(), readBy: [],
    });
  } catch (e) { console.error('No se pudo enviar el aviso de la tarea:', e); }
}

/** Reporte de tarea en la forma que usan el gestor y Mis tareas. */
export interface ReporteTarea {
  id:       string;
  taskId:   string;
  autorUid: string;
  autor:    string;
  rol:      string;
  estado:   'completed' | 'in-progress' | 'not-completed';
  comentario: string;
  motivo:   string;
  archivos: { url: string; name: string; type: string; size: number }[];
  fecha:    Date | null;
}

export function aReporteTarea(id: string, d: Record<string, unknown>): ReporteTarea {
  const adj = Array.isArray(d.attachments) ? d.attachments as { url?: string; name?: string; type?: string; size?: number }[] : [];
  const estado = String(d.reportStatus ?? 'in-progress');
  return {
    id, taskId: String(d.taskId ?? ''), autorUid: String(d.reportedBy ?? ''),
    autor: String(d.reporterName ?? ''), rol: String(d.reporterRole ?? ''),
    estado: (estado in ESTADOS_REPORTE ? estado : 'in-progress') as ReporteTarea['estado'],
    comentario: String(d.comment ?? ''), motivo: String(d.reason ?? ''),
    archivos: adj.map(a => ({ url: a.url ?? '', name: a.name ?? 'archivo', type: a.type ?? 'application/octet-stream', size: a.size ?? 0 })),
    fecha: aFecha(d.updatedAt) ?? aFecha(d.createdAt),
  };
}

/** ¿Alguien reportó que la terminó y todavía no se confirmó? */
export const porRevisar = (t: Pick<Tarea, 'status'>, reportes: Pick<ReporteTarea, 'estado'>[]) =>
  t.status !== 'completed' && reportes.some(r => r.estado === 'completed');
