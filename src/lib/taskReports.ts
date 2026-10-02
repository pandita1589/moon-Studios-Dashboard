/**
 * taskReports.ts — CRUD de reportes de tareas en Firestore.
 *
 * Estructura Firestore:
 *   taskReports/{reportId}
 *     taskId        : string
 *     taskTitle     : string
 *     reportedBy    : string   (uid)
 *     reporterName  : string
 *     reporterRole  : UserRole
 *     reportStatus  : 'completed' | 'not-completed' | 'in-progress'
 *     comment       : string
 *     reason        : string   (obligatorio si reportStatus === 'not-completed')
 *     attachments   : Attachment[]
 *     createdAt     : Timestamp
 *     updatedAt     : Timestamp
 */

import {
  collection, addDoc, updateDoc, deleteDoc, getDocs, getDoc,
  doc, query, where, orderBy, serverTimestamp, Timestamp,
  type QueryDocumentSnapshot, type DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { supabase, REPORTS_BUCKET, deleteReportFile } from '@/lib/supabaseclient';

export type ReportStatus = 'completed' | 'not-completed' | 'in-progress';

export interface Attachment {
  url:  string;
  name: string;
  type: string;
  size: number;
}

export interface TaskReport {
  id:           string;
  taskId:       string;
  taskTitle:    string;
  reportedBy:   string;
  reporterName: string;
  reporterRole: string;
  reportStatus: ReportStatus;
  comment:      string;
  reason:       string;        // solo si reportStatus === 'not-completed'
  attachments:  Attachment[];
  createdAt:    Date;
  updatedAt:    Date;
}

const COL = 'taskReports';

// ── helpers ──────────────────────────────────────────────────────────────────

function toDate(v: unknown): Date {
  if (!v) return new Date();
  if (v instanceof Timestamp) return v.toDate();
  if (typeof v === 'object' && v !== null && 'toDate' in v) {
    const candidate = (v as { toDate: unknown }).toDate;
    if (typeof candidate === 'function') return (v as { toDate: () => Date }).toDate();
  }
  return new Date(v as string | number);
}

function mapDoc(d: QueryDocumentSnapshot<DocumentData>): TaskReport {
  const data = d.data();
  return {
    id:           d.id,
    taskId:       (data['taskId']       as string) ?? '',
    taskTitle:    (data['taskTitle']    as string) ?? '',
    reportedBy:   (data['reportedBy']   as string) ?? '',
    reporterName: (data['reporterName'] as string) ?? '',
    reporterRole: (data['reporterRole'] as string) ?? '',
    reportStatus: (data['reportStatus'] as ReportStatus) ?? 'in-progress',
    comment:      (data['comment']      as string) ?? '',
    reason:       (data['reason']       as string) ?? '',
    attachments:  (data['attachments']  as Attachment[]) ?? [],
    createdAt:    toDate(data['createdAt']),
    updatedAt:    toDate(data['updatedAt']),
  };
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

/** Crea un nuevo reporte. */
export async function createTaskReport(data: Omit<TaskReport, 'id' | 'createdAt' | 'updatedAt'>) {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Actualiza un reporte existente. */
export async function updateTaskReport(
  reportId: string,
  data: Partial<Omit<TaskReport, 'id' | 'createdAt'>>,
) {
  await updateDoc(doc(db, COL, reportId), { ...data, updatedAt: serverTimestamp() });
}

/**
 * Elimina un reporte y, después, sus adjuntos en Supabase.
 * Primero el documento: si eso falla, los archivos siguen disponibles para el
 * reporte. La limpieza del almacenamiento es best effort y nunca hace fallar
 * el borrado (como en CEOPanel: se vacía la carpeta {taskId}/{reportedBy}).
 */
export async function deleteTaskReport(reportId: string) {
  const ref  = doc(db, COL, reportId);
  const snap = await getDoc(ref).catch(() => null);
  const data = snap?.exists() ? snap.data() : null;
  await deleteDoc(ref);
  if (!data) return;

  try {
    const urls = Array.isArray(data['attachments'])
      ? (data['attachments'] as Partial<Attachment>[]).map(a => a.url).filter((u): u is string => !!u)
      : [];
    await Promise.all(urls.map(u => deleteReportFile(u)));

    // Además, lo que haya quedado en la carpeta del reporte (subidas que no llegaron a guardarse).
    const carpeta = data['taskId'] && data['reportedBy'] ? `${data['taskId']}/${data['reportedBy']}` : '';
    if (carpeta) {
      const { data: lista } = await supabase.storage.from(REPORTS_BUCKET).list(carpeta);
      if (lista && lista.length > 0) {
        await supabase.storage.from(REPORTS_BUCKET).remove(lista.map(f => `${carpeta}/${f.name}`));
      }
    }
  } catch (err) {
    console.error('Reporte eliminado, pero no se pudieron borrar todos sus adjuntos:', err);
  }
}

/** Obtiene todos los reportes de una tarea (para CEO/Admin). */
export async function getReportsByTask(taskId: string): Promise<TaskReport[]> {
  const q    = query(collection(db, COL), where('taskId', '==', taskId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(mapDoc);
}

/** Obtiene el reporte que hizo un usuario específico sobre una tarea. */
export async function getMyReport(taskId: string, uid: string): Promise<TaskReport | null> {
  const q    = query(collection(db, COL), where('taskId', '==', taskId), where('reportedBy', '==', uid));
  const snap = await getDocs(q);
  return snap.empty ? null : mapDoc(snap.docs[0]);
}

/** Obtiene todos los reportes (vista global CEO/Admin). */
export async function getAllReports(): Promise<TaskReport[]> {
  const q    = query(collection(db, COL), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(mapDoc);
}

/** Obtiene los reportes de todos los miembros de un rol. */
export async function getReportsByRole(role: string): Promise<TaskReport[]> {
  const q    = query(collection(db, COL), where('reporterRole', '==', role), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(mapDoc);
}