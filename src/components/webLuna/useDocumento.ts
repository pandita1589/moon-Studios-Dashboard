import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { copia, igual, mensajeError, type LunaFetch } from './comun';

// ─── Un documento de la web (Empresa o Contacto) en edición ──────────────────
// Lo publicado y el borrador; guardar (PUT), restaurar el predeterminado
// (DELETE) y descartar. `limpiar` deja solo lo que acepta la API, y es lo
// que se compara para saber si hay cambios.

export interface DocBase { doc: string; actualizadoEn: string | null; predeterminado: boolean }

export function useDocumento<T extends DocBase>(lunaFetch: LunaFetch, inicial: T, limpiar: (d: T) => unknown, nombre: string, onSucio: (s: boolean) => void) {
  const [original, setOriginal] = useState<T>(inicial);
  const [borrador, setBorrador] = useState<T>(() => copia(inicial));
  const [guardando, setGuardando] = useState(false);
  const hayCambios = !igual(limpiar(borrador), limpiar(original));

  useEffect(() => { onSucio(hayCambios); }, [hayCambios, onSucio]);

  const cambiar = (f: (d: T) => void) => setBorrador(prev => { const n = copia(prev); f(n); return n; });
  const aplicar = (d: T) => { setOriginal(d); setBorrador(copia(d)); };

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await lunaFetch(`/api/bot/web/${inicial.doc}`, { method: 'PUT', body: JSON.stringify(limpiar(borrador)) });
      aplicar(r.data as T);
      toast.success(`Publicado en la web de Luna: ${nombre}`);
    } catch (e) {
      toast.error(mensajeError(e, 'No se pudo guardar'));
    } finally { setGuardando(false); }
  };

  const restaurar = async () => {
    if (!window.confirm(`¿Volver al contenido predeterminado de ${nombre}? Se pierde la versión editada en los cuatro idiomas.`)) return;
    setGuardando(true);
    try {
      const r = await lunaFetch(`/api/bot/web/${inicial.doc}`, { method: 'DELETE' });
      aplicar(r.data as T);
      toast.success(`${nombre} volvió al contenido predeterminado`);
    } catch (e) {
      toast.error(mensajeError(e, 'No se pudo restaurar'));
    } finally { setGuardando(false); }
  };

  const descartar = () => setBorrador(copia(original));

  return { original, borrador, cambiar, hayCambios, guardando, guardar, restaurar, descartar };
}
