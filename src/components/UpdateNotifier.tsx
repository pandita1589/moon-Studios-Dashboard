import { useEffect, useRef, useState, useCallback } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Download, X, RefreshCw, Sparkles, ArrowRight, CheckCircle } from 'lucide-react';

// ── Guard: solo corre dentro de Tauri, nunca en el browser ──────────────────
const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

type UpdateStep = 'idle' | 'available' | 'downloading' | 'ready' | 'error';

interface UpdateInfo {
  version: string;
  notes:   string;
  date:    string;
}

// ── Firestore helpers (silenciosos, no bloquean el flujo) ───────────────────
async function publishVersion(field: Record<string, unknown>) {
  try {
    await setDoc(doc(db, 'app_meta', 'version'), {
      ...field,
      updatedAt: Timestamp.now(),
    }, { merge: true });
  } catch (e) {
    console.warn('[UpdateNotifier] Firestore write failed:', e);
  }
}

// ── Componente principal ────────────────────────────────────────────────────
const UpdateNotifier: React.FC = () => {
  const [step,       setStep]       = useState<UpdateStep>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress,   setProgress]   = useState(0);
  const [downloaded, setDownloaded] = useState(0);
  const [total,      setTotal]      = useState(0);
  const [dismissed,  setDismissed]  = useState(false);

  // useRef para evitar race condition: se lee sincrónicamente en handleUpdate
  const updateRef    = useRef<Update | null>(null);
  // contentLength solo llega en el evento Started, lo guardamos aquí para
  // usarlo dentro del evento Progress (que solo trae chunkLength)
  const totalBytesRef = useRef<number>(0);

  // ── Publicar versión actual en Firestore ──
  const publishCurrentVersion = useCallback(async () => {
    if (!IS_TAURI) return;
    try {
      const version = await getVersion();
      await publishVersion({ current: version });
    } catch (e) {
      console.warn('[UpdateNotifier] getVersion failed:', e);
    }
  }, []);

  // ── Chequear actualizaciones ──
  const checkForUpdates = useCallback(async () => {
    if (!IS_TAURI) return;
    try {
      const update = await check();

      if (!update?.available) return;

      // Guardar en ref (sincrónico) y en state (para UI)
      updateRef.current = update;

      setUpdateInfo({
        version: update.version          ?? 'Nueva versión',
        notes:   update.body             ?? 'Mejoras y correcciones.',
        date:    update.date             ?? new Date().toISOString(),
      });
      setStep('available');

      await publishVersion({
        latest:       update.version ?? '',
        releaseNotes: update.body    ?? '',
        notifiedAt:   Timestamp.now(),
      });
    } catch (e) {
      console.warn('[UpdateNotifier] check() failed:', e);
      // No mostramos error al usuario si la comprobación falla silenciosamente
    }
  }, []);

useEffect(() => {
  if (!IS_TAURI) return; // no hace nada en el browser

  // No correr updater en Android/iOS
  const platform = (window as any).__TAURI_INTERNALS__?.metadata?.os;
  if (platform === 'android' || platform === 'ios') return;

  publishCurrentVersion();
  checkForUpdates();

  const interval = setInterval(checkForUpdates, 30 * 60 * 1000);
  return () => clearInterval(interval);
}, [checkForUpdates, publishCurrentVersion]);

  // ── Descargar e instalar (Tauri v2: download() + install() separados) ──
  const handleUpdate = async () => {
    const update = updateRef.current; // lectura sincrónica, nunca null aquí
    if (!update) return;

    setStep('downloading');
    setProgress(0);
    setDownloaded(0);
    setTotal(0);
    totalBytesRef.current = 0;

    try {
      // PASO 1 — Descargar con seguimiento de progreso
      // Tipos Tauri v2:
      //   Started  → { contentLength?: number }
      //   Progress → { chunkLength: number }   ← NO tiene contentLength
      //   Finished → {}
      await update.download((event) => {
        switch (event.event) {
          case 'Started': {
            const total = event.data.contentLength ?? 0;
            totalBytesRef.current = total;
            setTotal(total);
            break;
          }

          case 'Progress': {
            const chunk = event.data.chunkLength ?? 0;
            setDownloaded(prev => {
              const next  = prev + chunk;
              const total = totalBytesRef.current;
              if (total > 0) {
                setProgress(Math.min(Math.round((next / total) * 100), 99));
              }
              return next;
            });
            break;
          }

          case 'Finished':
            setProgress(100);
            break;
        }
      });

      // PASO 2 — Instalar (separado de download en Tauri v2)
      await update.install();

      setStep('ready');
    } catch (e) {
      console.error('[UpdateNotifier] Download/install failed:', e);
      setStep('error');
    }
  };

  const handleRelaunch = async () => {
    await relaunch();
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
  };

  // ── Guards de render ──
  if (!IS_TAURI)              return null; // nunca se muestra en el browser
  if (step === 'idle')        return null;
  if (dismissed)              return null;

  return (
    <>
      {/* Overlay de fondo (solo en downloading y ready) */}
      {(step === 'downloading' || step === 'ready') && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]" />
      )}

      {/* Toast / Modal */}
      <div
        className={`fixed z-[9999] transition-all duration-500 ${
          step === 'downloading' || step === 'ready'
            ? 'inset-0 flex items-center justify-center'
            : 'bottom-5 right-5 max-w-sm w-full'
        }`}
      >
        <div
          className={`bg-zinc-950 border rounded-2xl overflow-hidden shadow-2xl ${
            step === 'downloading' || step === 'ready'
              ? 'w-full max-w-md border-zinc-700'
              : 'border-emerald-800/50 shadow-emerald-900/20'
          }`}
          style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(52,211,153,0.1)' }}
        >

          {/* ── STEP: available ── */}
          {step === 'available' && (
            <>
              <div className="relative px-5 pt-5 pb-4 overflow-hidden">
                <div
                  className="absolute inset-0 opacity-10"
                  style={{ background: 'radial-gradient(ellipse at top left, #34d399, transparent 60%)' }}
                />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-white font-light text-sm leading-snug">
                        Nueva versión disponible
                      </p>
                      <p className="text-emerald-400 font-extralight text-xs mt-0.5">
                        v{updateInfo?.version}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setDismissed(true)}
                    className="text-zinc-600 hover:text-zinc-400 transition-colors mt-0.5 flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {updateInfo?.notes && (
                <div className="px-5 pb-3">
                  <div className="bg-zinc-900/60 rounded-xl border border-zinc-800 px-3 py-2.5">
                    <p className="text-zinc-400 font-extralight text-xs leading-relaxed">
                      {updateInfo.notes}
                    </p>
                  </div>
                </div>
              )}

              <div className="px-5 pb-5 flex gap-2">
                <button
                  onClick={() => setDismissed(true)}
                  className="flex-1 py-2 rounded-xl border border-zinc-800 text-zinc-500 font-extralight text-xs hover:text-zinc-300 hover:border-zinc-700 transition-all"
                >
                  Después
                </button>
                <button
                  onClick={handleUpdate}
                  className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-light text-xs flex items-center justify-center gap-1.5 transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  Actualizar ahora
                </button>
              </div>
            </>
          )}

          {/* ── STEP: downloading ── */}
          {step === 'downloading' && (
            <div className="p-8 flex flex-col items-center gap-5">
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20" />
                <div
                  className="absolute inset-0 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin"
                  style={{ animationDuration: '1s' }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Download className="w-7 h-7 text-emerald-400" />
                </div>
              </div>

              <div className="text-center">
                <p className="text-white font-light text-base">Descargando actualización</p>
                <p className="text-zinc-500 font-extralight text-sm mt-1">
                  v{updateInfo?.version} — Por favor no cierres la app
                </p>
              </div>

              <div className="w-full space-y-2">
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-600 font-extralight text-xs">
                    {total > 0
                      ? `${formatBytes(downloaded)} / ${formatBytes(total)}`
                      : 'Conectando…'}
                  </span>
                  <span className="text-emerald-400 font-extralight text-xs">
                    {progress}%
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP: ready ── */}
          {step === 'ready' && (
            <div className="p-8 flex flex-col items-center gap-5">
              <div className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle className="w-9 h-9 text-emerald-400" />
              </div>

              <div className="text-center">
                <p className="text-white font-light text-base">¡Listo para instalar!</p>
                <p className="text-zinc-500 font-extralight text-sm mt-1">
                  La actualización se instalará y la app se reiniciará.
                </p>
              </div>

              <button
                onClick={handleRelaunch}
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-light text-sm flex items-center justify-center gap-2 transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                Reiniciar e instalar
                <ArrowRight className="w-4 h-4" />
              </button>

              <p className="text-zinc-700 font-extralight text-xs text-center">
                También podés cerrar la app; la actualización se aplicará al próximo inicio.
              </p>
            </div>
          )}

          {/* ── STEP: error ── */}
          {step === 'error' && (
            <div className="p-6 flex flex-col items-center gap-4">
              <p className="text-red-400 font-extralight text-sm text-center">
                Error al descargar. Verificá tu conexión e intentá de nuevo.
              </p>
              <div className="flex gap-2 w-full">
                <button
                  onClick={() => setDismissed(true)}
                  className="flex-1 py-2 rounded-xl border border-zinc-800 text-zinc-500 font-extralight text-xs hover:text-zinc-300 transition-all"
                >
                  Cerrar
                </button>
                <button
                  onClick={() => { setStep('available'); setProgress(0); setDownloaded(0); }}
                  className="flex-1 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-extralight text-xs transition-all"
                >
                  Reintentar
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
};

export default UpdateNotifier;