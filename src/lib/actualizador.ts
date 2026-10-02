// ─── Actualizaciones de la app de escritorio ────────────────────────────────
// Un solo estado compartido por el aviso flotante (UpdateNotifier) y la
// sección de Configuración. Antes cada uno tenía su copia y se hablaban por
// eventos y localStorage: si la descarga fallaba el aviso desaparecía sin
// decir nada, las notas se cortaban a 90 caracteres y no había forma de
// buscar a mano, posponer ni saltarse una versión.
//
// Flujo: buscar → disponible → descargar (con progreso, velocidad y tiempo)
// → lista → instalar. En Windows instalar abre el instalador en modo
// pasivo (solo una barra de progreso) y la app se cierra; el instalador la
// vuelve a abrir al terminar.

import { useSyncExternalStore } from 'react';
import type { Update } from '@tauri-apps/plugin-updater';
import { esEscritorio } from '@/lib/escritorio';

export type Fase =
  | 'inactivo' | 'buscando' | 'al-dia' | 'disponible'
  | 'descargando' | 'lista' | 'instalando' | 'error';

export interface EstadoActualizacion {
  fase:           Fase;
  versionActual:  string;
  version?:       string;
  notas?:         string;
  fecha?:         string;
  descargado:     number;
  total:          number;
  velocidad:      number;          // bytes/s (media móvil)
  error?:         string;
  ultimaBusqueda?: number;
  /** El aviso flotante se muestra (no pospuesta ni omitida). */
  avisar:         boolean;
}

const CLAVE_POSPUESTA   = 'moon_update_pospuesta';   // { version, hasta }
const CLAVE_OMITIDA     = 'moon_update_omitida';     // version
const CLAVE_AUTOMATICA  = 'moon_update_auto';        // '1' | '0'

const leer = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const guardar = (k: string, v: string | null) => {
  try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sin storage */ }
};

let estado: EstadoActualizacion = { fase: 'inactivo', versionActual: '', descargado: 0, total: 0, velocidad: 0, avisar: false };
let pendiente: Update | null = null;
let ocupado = false;
const oyentes = new Set<() => void>();

function cambiar(parcial: Partial<EstadoActualizacion>) {
  estado = { ...estado, ...parcial };
  oyentes.forEach(f => f());
}

const suscribir = (f: () => void) => { oyentes.add(f); return () => { oyentes.delete(f); }; };
const instantanea = () => estado;

/** Estado en vivo para componentes React. */
export const useActualizador = () => useSyncExternalStore(suscribir, instantanea, instantanea);

export const descargaAutomatica = () => leer(CLAVE_AUTOMATICA) !== '0';
export const setDescargaAutomatica = (v: boolean) => guardar(CLAVE_AUTOMATICA, v ? '1' : '0');

function debeAvisar(version: string): boolean {
  if (leer(CLAVE_OMITIDA) === version) return false;
  try {
    const p = JSON.parse(leer(CLAVE_POSPUESTA) || 'null') as { version: string; hasta: number } | null;
    if (p && p.version === version && Date.now() < p.hasta) return false;
  } catch { /* valor viejo */ }
  return true;
}

const mensajeError = (e: unknown) => {
  const m = String((e as Error)?.message ?? e ?? '');
  if (/network|fetch|connect|dns|timed? ?out/i.test(m)) return 'No hay conexión con el servidor de actualizaciones. Revisa tu internet e inténtalo de nuevo.';
  if (/signature/i.test(m)) return 'La actualización descargada no tiene una firma válida, así que no se instaló.';
  return m || 'Error desconocido';
};

/** Busca una versión nueva. `manual` = el usuario apretó "Buscar ahora". */
export async function buscarActualizacion({ manual = false } = {}): Promise<void> {
  if (!esEscritorio() || ocupado) return;
  if (['descargando', 'lista', 'instalando'].includes(estado.fase)) return;
  ocupado = true;
  if (manual) cambiar({ fase: 'buscando', error: undefined });
  try {
    if (!estado.versionActual) {
      const { getVersion } = await import('@tauri-apps/api/app');
      cambiar({ versionActual: await getVersion() });
    }
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    cambiar({ ultimaBusqueda: Date.now() });
    if (!update) {
      pendiente = null;
      cambiar({ fase: manual ? 'al-dia' : 'inactivo', version: undefined, notas: undefined, avisar: false });
      return;
    }
    pendiente = update;
    // Al buscar a mano se avisa aunque la hubieras pospuesto u omitido.
    const avisar = manual || debeAvisar(update.version);
    if (manual) { guardar(CLAVE_OMITIDA, null); guardar(CLAVE_POSPUESTA, null); }
    cambiar({
      fase: 'disponible', version: update.version, fecha: update.date,
      notas: (update.body ?? '').trim() || 'Mejoras y correcciones.',
      avisar, error: undefined,
    });
    ocupado = false;
    // Descarga en segundo plano: cuando termine, solo falta reiniciar.
    if (descargaAutomatica()) await descargarActualizacion();
  } catch (e) {
    console.warn('[Actualizador] búsqueda fallida:', e);
    // Una búsqueda automática que falla no molesta; una manual sí avisa.
    if (manual) cambiar({ fase: 'error', error: mensajeError(e), avisar: false });
  } finally {
    ocupado = false;
  }
}

/** Descarga la versión encontrada, con progreso y velocidad. */
export async function descargarActualizacion(): Promise<void> {
  if (!pendiente || ocupado) return;
  ocupado = true;
  cambiar({ fase: 'descargando', descargado: 0, total: 0, velocidad: 0, error: undefined });
  let descargado = 0;
  let ultimoT = performance.now(), ultimoB = 0, velocidad = 0, ultimoPintado = 0;
  try {
    await pendiente.download(ev => {
      if (ev.event === 'Started') {
        cambiar({ total: ev.data.contentLength ?? 0 });
      } else if (ev.event === 'Progress') {
        descargado += ev.data.chunkLength ?? 0;
        const ahora = performance.now();
        if (ahora - ultimoT >= 500) {
          const instantanea = (descargado - ultimoB) / ((ahora - ultimoT) / 1000);
          velocidad = velocidad ? velocidad * 0.7 + instantanea * 0.3 : instantanea;
          ultimoT = ahora; ultimoB = descargado;
        }
        // Sin repintar en cada trozo (son miles): 8 veces por segundo basta.
        if (ahora - ultimoPintado > 120) { ultimoPintado = ahora; cambiar({ descargado, velocidad }); }
      } else if (ev.event === 'Finished') {
        cambiar({ descargado: estado.total || descargado });
      }
    });
    cambiar({ fase: 'lista', avisar: true });
  } catch (e) {
    console.error('[Actualizador] descarga fallida:', e);
    cambiar({ fase: 'error', error: mensajeError(e), avisar: true });
  } finally {
    ocupado = false;
  }
}

/** Instala lo descargado y reinicia la app. */
export async function instalarActualizacion(): Promise<void> {
  if (!pendiente || estado.fase !== 'lista') return;
  cambiar({ fase: 'instalando' });
  try {
    // En Windows esto abre el instalador (modo pasivo) y cierra la app.
    await pendiente.install();
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (e) {
    console.error('[Actualizador] instalación fallida:', e);
    cambiar({ fase: 'error', error: mensajeError(e), avisar: true });
  }
}

/** "Recordar más tarde": no vuelve a avisar de esta versión por unas horas. */
export function posponerActualizacion(horas = 4) {
  if (estado.version) guardar(CLAVE_POSPUESTA, JSON.stringify({ version: estado.version, hasta: Date.now() + horas * 3600_000 }));
  cambiar({ avisar: false });
}

/** "Omitir esta versión": solo vuelve a avisar cuando salga otra. */
export function omitirVersion() {
  if (estado.version) guardar(CLAVE_OMITIDA, estado.version);
  cambiar({ avisar: false });
}

export const cerrarAviso = () => cambiar({ avisar: false });

/** Reintenta lo que falló: si ya había una versión, la descarga; si no, busca. */
export function reintentar() {
  if (pendiente) void descargarActualizacion();
  else void buscarActualizacion({ manual: true });
}

let iniciado = false;
/** Arranca las búsquedas: al abrir, cada 30 min y al volver a la ventana. */
export function iniciarActualizador(): () => void {
  if (!esEscritorio() || iniciado) return () => {};
  iniciado = true;
  void buscarActualizacion();
  const cada = setInterval(() => void buscarActualizacion(), 30 * 60_000);
  const alVolver = () => {
    if (document.visibilityState !== 'visible') return;
    if (!estado.ultimaBusqueda || Date.now() - estado.ultimaBusqueda > 15 * 60_000) void buscarActualizacion();
  };
  document.addEventListener('visibilitychange', alVolver);
  return () => { iniciado = false; clearInterval(cada); document.removeEventListener('visibilitychange', alVolver); };
}

export const formatoBytes = (b: number) =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`;

export function tiempoRestante(e: EstadoActualizacion): string {
  if (!e.total || !e.velocidad) return '';
  const s = Math.max(0, Math.round((e.total - e.descargado) / e.velocidad));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}
