/**
 * taskReports.ts
 * CRUD de reportes de tareas en Firestore.
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

function toDate(v: any): Date {
  if (!v) return new Date();
  if (v instanceof Timestamp) return v.toDate();
  if (v?.toDate)              return v.toDate();
  return new Date(v);
}

function mapDoc(d: any): TaskReport {
  const data = d.data();
  return {
    id:           d.id,
    taskId:       data.taskId       ?? '',
    taskTitle:    data.taskTitle    ?? '',
    reportedBy:   data.reportedBy   ?? '',
    reporterName: data.reporterName ?? '',
    reporterRole: data.reporterRole ?? '',
    reportStatus: data.reportStatus ?? 'in-progress',
    comment:      data.comment      ?? '',
    reason:       data.reason       ?? '',
    attachments:  data.attachments  ?? [],
    createdAt:    toDate(data.createdAt),
    updatedAt:    toDate(data.updatedAt),
  };
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

/** Crea un nuevo reporte. Lanza error si el usuario ya tiene uno para esa tarea. */
export async function createTaskReport(data: Omit<TaskReport, 'id' | 'createdAt' | 'updatedAt'>) {
  const payload = {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, COL), payload);
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

/** Obtiene todos los reportes (para vista global CEO/Admin). */
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