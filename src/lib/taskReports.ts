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
  collection, addDoc, updateDoc, deleteDoc, getDocs,
  doc, query, where, orderBy, serverTimestamp, Timestamp,
  type QueryDocumentSnapshot, type DocumentData,
} from 'firebase/firestore';
import { db } from './firebase'; // ajusta al path real de tu firebase.ts

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

/** Elimina un reporte. */
export async function deleteTaskReport(reportId: string) {
  await deleteDoc(doc(db, COL, reportId));
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