import { useEffect, useState } from 'react';
import { Download, RefreshCw, CheckCircle2, Sparkles, X, AlertCircle, ChevronDown, Loader2 } from 'lucide-react';
import {
  useActualizador, iniciarActualizador, descargarActualizacion, instalarActualizacion,
  posponerActualizacion, omitirVersion, cerrarAviso, reintentar, formatoBytes, tiempoRestante,
} from '@/lib/actualizador';
import { esEscritorio } from '@/lib/escritorio';

// ─── Aviso flotante de actualizaciones (app de escritorio) ──────────────────
// La lógica vive en lib/actualizador.ts; esto solo la muestra. Configuración
// → "Acerca de" usa el mismo estado, así que lo que pase acá se ve allá.

const ACENTO = 'var(--accent-user, #6366f1)';

const ESTILOS = `
  @keyframes upd-entrar { from { opacity: 0; transform: translateY(16px) scale(.97) } to { opacity: 1; transform: none } }
  @keyframes upd-fundido { from { opacity: 0 } to { opacity: 1 } }
  @keyframes upd-giro { to { transform: rotate(360deg) } }
  @keyframes upd-brillo { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
  .upd-card { position: fixed; right: 20px; bottom: 20px; width: 340px; max-width: calc(100vw - 32px); z-index: 9999;
    background: var(--notif-bg, #0b0b0e); border: 1px solid var(--border-main, #27272a); border-radius: 18px;
    box-shadow: 0 24px 60px rgba(0,0,0,.45); color: var(--text-primary, #fafafa); animation: upd-entrar .35s cubic-bezier(.22,1,.36,1); overflow: hidden; }
  .upd-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 14px; border-radius: 11px;
    font-size: 12px; cursor: pointer; transition: opacity .15s, background .15s; border: 1px solid transparent; }
  .upd-btn:disabled { opacity: .5; cursor: default; }
  .upd-btn-pri { background: ${ACENTO}; color: #fff; flex: 1; }
  .upd-btn-pri:hover { opacity: .9; }
  .upd-btn-sec { background: transparent; color: var(--text-muted, #a1a1aa); border-color: var(--border-main, #27272a); }
  .upd-btn-sec:hover { background: var(--surface-hover, rgba(255,255,255,.04)); color: var(--text-primary, #fafafa); }
  .upd-link { background: none; border: 0; padding: 0; font-size: 11px; color: var(--text-muted, #a1a1aa); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
  .upd-x { background: none; border: 0; padding: 4px; border-radius: 6px; cursor: pointer; color: var(--text-muted, #a1a1aa); }
  .upd-x:hover { color: var(--text-primary, #fafafa); }
  .upd-barra { height: 6px; border-radius: 99px; background: var(--border-main, #27272a); overflow: hidden; }
  .upd-barra > div { height: 100%; border-radius: 99px; background: ${ACENTO}; transition: width .25s ease; }
  .upd-barra.indet > div { width: 40% !important; background: linear-gradient(90deg, transparent, ${ACENTO}, transparent); background-size: 200% 100%; animation: upd-brillo 1.2s linear infinite; }
  .upd-notas { font-size: 12px; line-height: 1.55; color: var(--text-muted, #a1a1aa); background: var(--surface-subtle, rgba(255,255,255,.03));
    border: 1px solid var(--border-main, #27272a); border-radius: 10px; padding: 9px 11px; max-height: 160px; overflow-y: auto; }
  .upd-notas ul { margin: 0; padding-left: 16px; }
  .upd-notas p { margin: 0 0 4px; }
`;

/** Notas de versión: párrafos y líneas con "-" o "•" como lista. */
function Notas({ texto }: { texto: string }) {
  const lineas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items = lineas.filter(l => /^[-•*]\s+/.test(l));
  const parrafos = lineas.filter(l => !/^[-•*]\s+/.test(l));
  return (
    <div className="upd-notas">
      {parrafos.map((p, i) => <p key={i}>{p}</p>)}
      {items.length > 0 && <ul>{items.map((l, i) => <li key={i}>{l.replace(/^[-•*]\s+/, '')}</li>)}</ul>}
    </div>
  );
}

const fechaCorta = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long' });
};

const Icono: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <div style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`, color }}>
    {children}
  </div>
);

const UpdateNotifier: React.FC = () => {
  const e = useActualizador();
  const [verNotas, setVerNotas] = useState(false);

  useEffect(() => iniciarActualizador(), []);

  if (!esEscritorio()) return null;

  // ══ Instalando: la app se va a cerrar ═════════════════════════════════════
  if (e.fase === 'instalando') {
    return (
      <>
        <style>{ESTILOS}</style>
        <div style={{ position: 'fixed', inset: 0, top: 'var(--titlebar-offset, 0px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(10px)', animation: 'upd-fundido .25s ease' }}>
          <div className="upd-card" style={{ position: 'static', width: 360, padding: 28, textAlign: 'center' }}>
            <Loader2 size={30} style={{ color: ACENTO, animation: 'upd-giro 1s linear infinite', margin: '0 auto 14px', display: 'block' }} />
            <p style={{ fontSize: 15, margin: '0 0 6px' }}>Instalando v{e.version}…</p>
            <p style={{ fontSize: 12, margin: 0, color: 'var(--text-muted)' }}>
              La app se cerrará un momento y se abrirá sola con la versión nueva. No apagues el equipo.
            </p>
          </div>
        </div>
      </>
    );
  }

  if (!e.avisar) return null;
  if (!['disponible', 'descargando', 'lista', 'error'].includes(e.fase)) return null;

  const pct = e.total ? Math.min(100, Math.round((e.descargado / e.total) * 100)) : 0;
  const quedan = tiempoRestante(e);

  return (
    <>
      <style>{ESTILOS}</style>
      <div className="upd-card" role="status" aria-live="polite">
        <div style={{ padding: 16 }}>
          {/* ── Disponible ── */}
          {e.fase === 'disponible' && (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
                <Icono color="#34d399"><Sparkles size={16} /></Icono>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, margin: '0 0 2px' }}>Nueva versión disponible</p>
                  <p style={{ fontSize: 11, margin: 0, color: 'var(--text-muted)' }}>
                    v{e.versionActual || '—'} → <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>v{e.version}</strong>
                    {fechaCorta(e.fecha) && ` · ${fechaCorta(e.fecha)}`}
                  </p>
                </div>
                <button className="upd-x" onClick={() => posponerActualizacion()} title="Recordar más tarde"><X size={14} /></button>
              </div>
              {e.notas && (
                <div style={{ marginBottom: 12 }}>
                  <button className="upd-link" onClick={() => setVerNotas(v => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginBottom: 6, textDecoration: 'none' }}>
                    <ChevronDown size={12} style={{ transform: verNotas ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                    {verNotas ? 'Ocultar novedades' : 'Ver novedades'}
                  </button>
                  {verNotas && <Notas texto={e.notas} />}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <button className="upd-btn upd-btn-sec" onClick={() => posponerActualizacion()}>Más tarde</button>
                <button className="upd-btn upd-btn-pri" onClick={() => void descargarActualizacion()}><Download size={13} /> Actualizar</button>
              </div>
              <div style={{ textAlign: 'center' }}>
                <button className="upd-link" onClick={omitirVersion}>Omitir esta versión</button>
              </div>
            </>
          )}

          {/* ── Descargando ── */}
          {e.fase === 'descargando' && (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                <Icono color="#60a5fa"><Download size={16} /></Icono>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, margin: '0 0 2px' }}>Descargando v{e.version}</p>
                  <p style={{ fontSize: 11, margin: 0, color: 'var(--text-muted)' }}>Puedes seguir trabajando mientras tanto</p>
                </div>
                <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{e.total ? `${pct}%` : ''}</span>
                <button className="upd-x" onClick={cerrarAviso} title="Ocultar (la descarga sigue)"><X size={14} /></button>
              </div>
              <div className={`upd-barra${e.total ? '' : ' indet'}`}><div style={{ width: `${pct}%` }} /></div>
              <p style={{ fontSize: 11, margin: '8px 0 0', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {formatoBytes(e.descargado)}{e.total ? ` de ${formatoBytes(e.total)}` : ''}
                {e.velocidad > 0 && ` · ${formatoBytes(e.velocidad)}/s`}
                {quedan && ` · quedan ${quedan}`}
              </p>
            </>
          )}

          {/* ── Lista para instalar ── */}
          {e.fase === 'lista' && (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
                <Icono color="#34d399"><CheckCircle2 size={16} /></Icono>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, margin: '0 0 2px' }}>v{e.version} lista para instalar</p>
                  <p style={{ fontSize: 11, margin: 0, color: 'var(--text-muted)' }}>
                    La app se reinicia en unos segundos. Guarda lo que estés escribiendo.
                  </p>
                </div>
                <button className="upd-x" onClick={cerrarAviso} title="Instalar después (desde Configuración)"><X size={14} /></button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="upd-btn upd-btn-sec" onClick={cerrarAviso}>Después</button>
                <button className="upd-btn upd-btn-pri" onClick={() => void instalarActualizacion()}><RefreshCw size={13} /> Reiniciar y actualizar</button>
              </div>
            </>
          )}

          {/* ── Error ── */}
          {e.fase === 'error' && (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
                <Icono color="#f87171"><AlertCircle size={16} /></Icono>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, margin: '0 0 2px' }}>No se pudo actualizar</p>
                  <p style={{ fontSize: 11, margin: 0, color: 'var(--text-muted)', lineHeight: 1.45 }}>{e.error}</p>
                </div>
                <button className="upd-x" onClick={cerrarAviso} title="Cerrar"><X size={14} /></button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="upd-btn upd-btn-sec" onClick={cerrarAviso}>Cerrar</button>
                <button className="upd-btn upd-btn-pri" onClick={reintentar}><RefreshCw size={13} /> Reintentar</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default UpdateNotifier;
