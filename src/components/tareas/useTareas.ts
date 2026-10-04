import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db, subscribeToTasks, subscribeToUsers } from '@/lib/firebase';
import { aTarea, aReporteTarea, esGestorTareas, type Tarea, type ReporteTarea } from '@/lib/tareas';
import type { UserProfile } from '@/types';

/**
 * Tareas, usuarios y reportes en vivo. CEO y Administración reciben todos los
 * reportes; los demás solo los suyos (lo que permiten las reglas de Firestore).
 */
export function useTareas(perfil: Pick<UserProfile, 'uid' | 'role'> | null | undefined) {
  const [tareas,   setTareas]   = useState<Tarea[]>([]);
  const [usuarios, setUsuarios] = useState<UserProfile[]>([]);
  const [reportes, setReportes] = useState<ReporteTarea[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const uid = perfil?.uid;
  const gestor = esGestorTareas(perfil?.role);

  useEffect(() => {
    const u1 = subscribeToTasks(
      raw => { setTareas(raw.map(r => aTarea(r as Record<string, unknown>))); setCargando(false); setError(null); },
      e => { console.error('tareas:', e); setError('No se pudieron cargar las tareas'); setCargando(false); });
    const u2 = subscribeToUsers(u => setUsuarios(u as UserProfile[]), e => console.error('usuarios:', e));
    return () => { u1(); u2(); };
  }, []);

  useEffect(() => {
    if (!uid) return;
    const q = gestor
      ? query(collection(db, 'taskReports'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'taskReports'), where('reportedBy', '==', uid));
    return onSnapshot(q,
      snap => setReportes(snap.docs.map(d => aReporteTarea(d.id, d.data()))
        .sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0))),
      e => console.error('reportes:', e));
  }, [uid, gestor]);

  return { tareas, usuarios, reportes: uid ? reportes : [], cargando, error };
}
