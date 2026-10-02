import { useState } from 'react';
import { Cpu, RefreshCw, Download, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import {
  useActualizador, buscarActualizacion, descargarActualizacion, instalarActualizacion,
  reintentar, descargaAutomatica, setDescargaAutomatica, formatoBytes, tiempoRestante,
} from '@/lib/actualizador';

// ─── Configuración → Actualizaciones (app de escritorio) ───────────────────
// Mismo estado que el aviso flotante (lib/actualizador.ts): desde acá se
// puede buscar a mano, ver el progreso e instalar lo que quedó descargado.

const hace = (t?: number) => {
  if (!t) return 'todavía no';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'hace un momento' : m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`;
};

export default function SeccionActualizaciones({ acento, borde }: { acento: string; borde: string }) {
  const e = useActualizador();
  const [auto, setAuto] = useState(descargaAutomatica());
  const pct = e.total ? Math.min(100, Math.round((e.descargado / e.total) * 100)) : 0;

  const linea = (() => {
    switch (e.fase) {
      case 'buscando':    return { icono: <Loader2 size={13} className="animate-spin" />, color: 'var(--text-muted)', texto: 'Buscando actualizaciones…' };
      case 'al-dia':      return { icono: <CheckCircle2 size={13} />, color: '#34d399', texto: 'Tienes la última versión.' };
      case 'disponible':  return { icono: <Download size={13} />, color: '#34d399', texto: `v${e.version} disponible.` };
      case 'descargando': return { icono: <Loader2 size={13} className="animate-spin" />, color: '#60a5fa', texto: `Descargando v${e.version}… ${e.total ? `${pct}%` : ''}` };
      case 'lista':       return { icono: <CheckCircle2 size={13} />, color: '#34d399', texto: `v${e.version} descargada: reinicia para instalarla.` };
      case 'instalando':  return { icono: <Loader2 size={13} className="animate-spin" />, color: '#60a5fa', texto: 'Instalando…' };
      case 'error':       return { icono: <AlertCircle size={13} />, color: '#f87171', texto: e.error ?? 'No se pudo actualizar.' };
      default:            return { icono: null, color: 'var(--text-muted)', texto: `Última búsqueda: ${hace(e.ultimaBusqueda)}.` };
    }
  })();

  const boton = (texto: string, onClick: () => void, principal = false, icono?: React.ReactNode, deshabilitado = false) => (
    <button onClick={onClick} disabled={deshabilitado}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 9, fontSize: 12, cursor: deshabilitado ? 'default' : 'pointer',
        opacity: deshabilitado ? 0.5 : 1, border: principal ? 'none' : `1px solid ${borde}`,
        background: principal ? acento : 'transparent', color: principal ? '#fff' : 'var(--text-muted)' }}>
      {icono}{texto}
    </button>
  );

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${borde}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: `${acento}18`, border: `1px solid ${acento}25`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Cpu size={14} style={{ color: acento }} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>Actualizaciones</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>moon Studios · Windows</div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: acento, background: `${acento}14`, border: `1px solid ${acento}33`, borderRadius: 8, padding: '4px 12px', fontVariantNumeric: 'tabular-nums' }}>
          v{e.versionActual || '—'}
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: linea.color }}>
        {linea.icono}<span>{linea.texto}</span>
      </div>

      {e.fase === 'descargando' && (
        <div style={{ marginTop: 8 }}>
          <div style={{ height: 5, borderRadius: 99, background: 'var(--border-main)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: acento, transition: 'width .25s' }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5, fontVariantNumeric: 'tabular-nums' }}>
            {formatoBytes(e.descargado)}{e.total ? ` de ${formatoBytes(e.total)}` : ''}
            {e.velocidad > 0 && ` · ${formatoBytes(e.velocidad)}/s`}
            {tiempoRestante(e) && ` · quedan ${tiempoRestante(e)}`}
          </div>
        </div>
      )}

      {(e.fase === 'disponible' || e.fase === 'lista') && e.notas && (
        <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.55, color: 'var(--text-muted)', whiteSpace: 'pre-line',
          background: 'var(--overlay-bg)', border: `1px solid ${borde}`, borderRadius: 10, padding: '9px 11px', maxHeight: 160, overflowY: 'auto' }}>
          {e.notas}
        </div>
      )}

      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {e.fase === 'disponible' && boton('Descargar', () => void descargarActualizacion(), true, <Download size={12} />)}
        {e.fase === 'lista' && boton('Reiniciar y actualizar', () => void instalarActualizacion(), true, <RefreshCw size={12} />)}
        {e.fase === 'error' && boton('Reintentar', reintentar, true, <RefreshCw size={12} />)}
        {boton('Buscar actualizaciones', () => void buscarActualizacion({ manual: true }), false, <RefreshCw size={12} />,
          ['buscando', 'descargando', 'instalando'].includes(e.fase))}
      </div>

      <label style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
        <input type="checkbox" checked={auto} onChange={ev => { setAuto(ev.target.checked); setDescargaAutomatica(ev.target.checked); }} />
        Descargar las actualizaciones automáticamente (solo pide reiniciar)
      </label>
    </div>
  );
}
