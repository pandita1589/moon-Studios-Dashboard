import { useEffect, useRef, useState, useCallback } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Download, RefreshCw, CheckCircle, Sparkles, X, Clock } from 'lucide-react';

const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// ── Eventos globales para comunicación con Settings ──────────────────────────
export const UPDATE_AVAILABLE_EVENT = 'moon:updateAvailable';
export const UPDATE_START_EVENT     = 'moon:startUpdate';
export const PENDING_UPDATE_KEY     = 'moon_pending_update';

export interface PendingUpdate { version: string; notes: string; }

type UpdateStep = 'idle' | 'available' | 'downloading' | 'installing' | 'relaunching';

async function publishVersion(field: Record<string, unknown>) {
  try {
    await setDoc(doc(db, 'app_meta', 'version'), { ...field, updatedAt: Timestamp.now() }, { merge: true });
  } catch { /* silencioso */ }
}

const STYLES = `
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0)    scale(1);    }
  }
  @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.88); }
    to   { opacity: 1; transform: scale(1);    }
  }
  @keyframes spin  { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
  @keyframes shimmer {
    0%   { background-position: -200% center; }
    100% { background-position:  200% center; }
  }
`;

const UpdateNotifier: React.FC = () => {
  const [step,       setStep]      = useState<UpdateStep>('idle');
  const [info,       setInfo]      = useState<PendingUpdate | null>(null);
  const [progress,   setProgress]  = useState(0);
  const [downloaded, setDl]        = useState(0);
  const [total,      setTotal]     = useState(0);
  const [countdown,  setCountdown] = useState(5);
  const [visible,    setVisible]   = useState(false);

  const totalRef     = useRef(0);
  const updatingRef  = useRef(false);
  const updateRef    = useRef<Update | null>(null);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Descargar + instalar + relaunch ────────────────────────────────────────
  const runAutoUpdate = useCallback(async (update: Update) => {
    if (updatingRef.current) return;
    updatingRef.current = true;

    // Limpiar localStorage al confirmar actualización
    localStorage.removeItem(PENDING_UPDATE_KEY);

    setStep('downloading');
    setProgress(0); setDl(0); setTotal(0);
    totalRef.current = 0;
    setVisible(true);

    try {
      await update.download((e) => {
        switch (e.event) {
          case 'Started':
            totalRef.current = e.data.contentLength ?? 0;
            setTotal(totalRef.current);
            break;
          case 'Progress':
            setDl(prev => {
              const next = prev + (e.data.chunkLength ?? 0);
              if (totalRef.current > 0)
                setProgress(Math.min(Math.round((next / totalRef.current) * 100), 99));
              return next;
            });
            break;
          case 'Finished':
            setProgress(100);
            break;
        }
      });

      setStep('installing');
      await update.install();

      setStep('relaunching');
      let count = 5;
      setCountdown(count);
      timerRef.current = setInterval(async () => {
        count--;
        setCountdown(count);
        if (count <= 0) { clearInterval(timerRef.current!); await relaunch(); }
      }, 1000);

    } catch (e) {
      console.error('[Updater]', e);
      updatingRef.current = false;
      setVisible(false);
      setStep('idle');
    }
  }, []);

  // ── Check for updates ─────────────────────────────────────────────────────
  const checkForUpdates = useCallback(async () => {
    if (!IS_TAURI || updatingRef.current) return;
    try {
      const update = await check();
      if (!update?.available) return;

      updateRef.current = update;
      const updateInfo: PendingUpdate = {
        version: update.version ?? '',
        notes:   update.body    ?? 'Mejoras y correcciones de rendimiento.',
      };
      setInfo(updateInfo);
      await publishVersion({ latest: update.version, notifiedAt: Timestamp.now() });

      // Mostrar toast "disponible" con botones
      setStep('available');
      setVisible(true);

    } catch (e) {
      console.warn('[Updater] check failed:', e);
    }
  }, [runAutoUpdate]);

  // ── Dismiss → guardar para Settings ──────────────────────────────────────
  const handleDismiss = useCallback(() => {
    if (!info) return;
    // Guardar en localStorage para que Settings lo muestre
    localStorage.setItem(PENDING_UPDATE_KEY, JSON.stringify(info));
    // Notificar a Settings via evento
    window.dispatchEvent(new CustomEvent(UPDATE_AVAILABLE_EVENT, { detail: info }));
    setVisible(false);
    setStep('idle');
  }, [info]);

  // ── Actualizar ahora ──────────────────────────────────────────────────────
  const handleUpdateNow = useCallback(() => {
    if (updateRef.current) runAutoUpdate(updateRef.current);
  }, [runAutoUpdate]);

  // ── Escuchar "moon:startUpdate" desde Settings ────────────────────────────
  useEffect(() => {
    const handler = async () => {
      if (updateRef.current) {
        // updateRef tiene la referencia del check() anterior — arrancar directo
        await runAutoUpdate(updateRef.current);
      } else {
        // updateRef se perdió (ej: app recargada) — hacer check() de nuevo
        await checkForUpdates();
      }
    };
    window.addEventListener(UPDATE_START_EVENT, handler);
    return () => window.removeEventListener(UPDATE_START_EVENT, handler);
  }, [runAutoUpdate, checkForUpdates]);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!IS_TAURI) return;
    const os = (window as any).__TAURI_INTERNALS__?.metadata?.os;
    if (os === 'android' || os === 'ios') return;

    (async () => {
      try {
        const v = await getVersion();
        await publishVersion({ current: v });
      } catch {}
      checkForUpdates();
    })();

    const interval = setInterval(checkForUpdates, 30 * 60 * 1000);
    return () => {
      clearInterval(interval);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [checkForUpdates]);

  const fmt = (b: number) => b >= 1048576
    ? `${(b / 1048576).toFixed(1)} MB`
    : `${(b / 1024).toFixed(0)} KB`;

  const relaunchNow = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    await relaunch();
  };

  if (!IS_TAURI || !visible || step === 'idle') return null;

  // ══ RELAUNCH — modal centrado ══════════════════════════════════════════════
  if (step === 'relaunching') {
    return (
      <>
        <style>{STYLES}</style>
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 9998, animation: 'fadeIn 0.3s ease' }} />
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: 24, padding: '40px 36px', width: '100%', maxWidth: 380, animation: 'scaleIn 0.35s cubic-bezier(0.34,1.56,0.64,1)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(52,211,153,0.12)', border: '1.5px solid rgba(52,211,153,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle size={32} color="#34d399" />
              </div>
            </div>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <p style={{ color: '#fff', fontWeight: 300, fontSize: 17, margin: '0 0 6px' }}>¡Actualización lista!</p>
              <p style={{ color: '#71717a', fontWeight: 300, fontSize: 13, margin: 0 }}>v{info?.version} instalada correctamente</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 28 }}>
              <div style={{ position: 'relative', width: 64, height: 64 }}>
                <svg viewBox="0 0 64 64" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)', width: '100%', height: '100%' }}>
                  <circle cx="32" cy="32" r="26" fill="none" stroke="#27272a" strokeWidth="4" />
                  <circle cx="32" cy="32" r="26" fill="none" stroke="#34d399" strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 26}`}
                    strokeDashoffset={`${2 * Math.PI * 26 * (1 - countdown / 5)}`}
                    style={{ transition: 'stroke-dashoffset 1s linear' }} />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#34d399', fontSize: 22, fontWeight: 300 }}>{countdown}</span>
                </div>
              </div>
              <p style={{ color: '#52525b', fontSize: 12, fontWeight: 300, margin: 0 }}>Reiniciando en {countdown}s…</p>
            </div>
            <button onClick={relaunchNow}
              style={{ width: '100%', padding: '11px 0', borderRadius: 14, background: '#34d399', border: 'none', color: '#000', fontSize: 13, fontWeight: 400, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              onMouseEnter={e => (e.currentTarget.style.background = '#6ee7b7')}
              onMouseLeave={e => (e.currentTarget.style.background = '#34d399')}>
              <RefreshCw size={15} /> Reiniciar ahora
            </button>
          </div>
        </div>
      </>
    );
  }

  // ══ TOAST bottom-right ═════════════════════════════════════════════════════
  return (
    <>
      <style>{STYLES}</style>
      <div style={{ position: 'fixed', bottom: 20, right: 20, width: 310, zIndex: 9999, animation: 'slideUp 0.4s cubic-bezier(0.22,1,0.36,1)' }}>
        <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: 20, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.65), 0 0 0 1px rgba(52,211,153,0.06)' }}>

          {/* AVAILABLE — con opciones */}
          {step === 'available' && (
            <div style={{ padding: '16px' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                  <Sparkles size={16} color="#34d399" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: '#fff', fontSize: 13, fontWeight: 400, margin: '0 0 3px', lineHeight: 1.3 }}>
                    Nueva versión disponible
                  </p>
                  <p style={{ color: '#52525b', fontSize: 11, margin: 0 }}>
                    v{info?.version} lista para instalar
                  </p>
                </div>
                <button onClick={handleDismiss}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3f3f46', padding: 4, flexShrink: 0, borderRadius: 6, transition: 'color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#71717a')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#3f3f46')}>
                  <X size={14} />
                </button>
              </div>

              {/* Notes */}
              {info?.notes && (
                <p style={{ color: '#52525b', fontSize: 11, lineHeight: 1.5, margin: '0 0 14px', padding: '8px 10px', background: '#111', borderRadius: 8, border: '1px solid #1f1f1f' }}>
                  {info.notes.length > 90 ? info.notes.slice(0, 90) + '…' : info.notes}
                </p>
              )}

              {/* Botones */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleDismiss}
                  style={{ flex: 1, padding: '9px 0', borderRadius: 11, background: 'transparent', border: '1px solid #27272a', color: '#71717a', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#111'; e.currentTarget.style.borderColor = '#3f3f46'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = '#27272a'; }}>
                  <Clock size={12} /> Más tarde
                </button>
                <button onClick={handleUpdateNow}
                  style={{ flex: 2, padding: '9px 0', borderRadius: 11, background: '#34d399', border: 'none', color: '#000', fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#6ee7b7')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#34d399')}>
                  <Download size={12} /> Actualizar ahora
                </button>
              </div>
            </div>
          )}

          {/* DOWNLOADING */}
          {step === 'downloading' && (
            <div style={{ padding: '14px 16px 13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ position: 'relative', width: 30, height: 30, flexShrink: 0 }}>
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid #27272a' }} />
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#34d399', animation: 'spin 0.9s linear infinite' }} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Download size={11} color="#34d399" />
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: '#fff', fontSize: 12, fontWeight: 300, margin: '0 0 2px' }}>Descargando actualización</p>
                  <p style={{ color: '#52525b', fontSize: 10, fontWeight: 300, margin: 0 }}>
                    v{info?.version}{total > 0 ? ` · ${fmt(downloaded)} / ${fmt(total)}` : ''}
                  </p>
                </div>
                <span style={{ color: '#34d399', fontSize: 11, flexShrink: 0 }}>{progress}%</span>
              </div>
              <div style={{ height: 3, background: '#27272a', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${progress}%`, borderRadius: 99,
                  background: progress < 100
                    ? 'linear-gradient(90deg, #34d399, #6ee7b7, #34d399)'
                    : '#34d399',
                  backgroundSize: '200% 100%',
                  animation: progress < 100 ? 'shimmer 1.5s infinite' : 'none',
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          )}

          {/* INSTALLING */}
          {step === 'installing' && (
            <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#34d399', flexShrink: 0, animation: 'spin 0.7s linear infinite' }} />
              <div>
                <p style={{ color: '#fff', fontSize: 12, fontWeight: 300, margin: '0 0 2px' }}>Instalando actualización…</p>
                <p style={{ color: '#52525b', fontSize: 10, fontWeight: 300, margin: 0 }}>v{info?.version}</p>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
};

export default UpdateNotifier;