// src/components/SessionModals.tsx
//
// Dos modales de sesión con animaciones profesionales:
//   <TabSyncModal>    — "¿Mantenerme aquí o ir a la otra pestaña?"
//   <AutoLogoutModal> — Contador regresivo de inactividad

import React from 'react';
import { LogOut, Monitor, Clock, Zap } from 'lucide-react';

// ── Keyframes compartidos ─────────────────────────────────────────────────────
export const SESSION_MODAL_STYLES = `
  @keyframes _sm_in {
    from { opacity: 0; transform: translateY(14px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0)     scale(1);   }
  }
  @keyframes _sm_overlay {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes _sm_countdown {
    from { stroke-dashoffset: 0; }
    to   { stroke-dashoffset: 163; }
  }
  @keyframes _sm_pulse {
    0%, 100% { opacity: 0.4; }
    50%       { opacity: 1; }
  }
  @keyframes _sm_shimmer {
    0%   { background-position: -200% center; }
    100% { background-position:  200% center; }
  }
  .__sm_overlay { animation: _sm_overlay 0.2s ease forwards; }
  .__sm_card    { animation: _sm_in 0.3s cubic-bezier(0.22,1,0.36,1) forwards; }
  .__sm_pulse   { animation: _sm_pulse 2s ease-in-out infinite; }
`;

// ── Componente base del modal ─────────────────────────────────────────────────
const ModalShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="__sm_overlay fixed inset-0 z-[9999] flex items-center justify-center"
    style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(14px)' }}
  >
    <div
      className="__sm_card w-[360px]"
      style={{
        background:   'rgba(8,8,8,0.97)',
        border:       '1px solid rgba(255,255,255,0.07)',
        borderRadius: '14px',
        boxShadow:    '0 40px 100px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.04)',
        overflow:     'hidden',
      }}
    >
      {children}
    </div>
  </div>
);

// ══════════════════════════════════════════════════════════════════════════════
// TabSyncModal
// ══════════════════════════════════════════════════════════════════════════════

interface TabSyncModalProps {
  onStayHere:   () => void;
  onGoToOther:  () => void;
}

export const TabSyncModal: React.FC<TabSyncModalProps> = ({ onStayHere, onGoToOther }) => (
  <ModalShell>
    {/* Franja superior decorativa */}
    <div style={{
      height: '3px',
      background: 'linear-gradient(90deg, #3b82f6 0%, #8b5cf6 50%, #3b82f6 100%)',
      backgroundSize: '200% 100%',
      animation: '_sm_shimmer 2.5s linear infinite',
    }} />

    <div style={{ padding: '28px 28px 24px' }}>
      {/* Icono */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        {[0, 1].map(i => (
          <div key={i} style={{
            width: '36px', height: '28px', borderRadius: '5px',
            background: i === 0 ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${i === 0 ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.07)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
          }}>
            <Monitor style={{ width: '14px', height: '14px', color: i === 0 ? '#3b82f6' : '#333' }} strokeWidth={1.5} />
            {i === 0 && (
              <div style={{
                position: 'absolute', top: '-4px', right: '-4px',
                width: '8px', height: '8px', borderRadius: '50%',
                background: '#3b82f6',
                boxShadow: '0 0 6px #3b82f6',
              }} className="__sm_pulse" />
            )}
          </div>
        ))}
        <div style={{ flex: 1 }} />
      </div>

      {/* Texto */}
      <p style={{
        color: '#d0d0d0', fontSize: '15px', fontWeight: 300,
        letterSpacing: '0.01em', marginBottom: '6px',
      }}>
        Sesión activa en otra pestaña
      </p>
      <p style={{
        color: '#3a3a3a', fontSize: '12px', fontWeight: 300,
        letterSpacing: '0.02em', lineHeight: 1.6, marginBottom: '24px',
      }}>
        Tu cuenta ya está abierta en otra pestaña del navegador.
        ¿Dónde quieres continuar?
      </p>

      {/* Botones */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button
          onClick={onStayHere}
          style={{
            width: '100%', padding: '11px 16px',
            borderRadius: '8px',
            background: '#fff',
            border: 'none',
            color: '#000', fontSize: '12px', fontWeight: 400,
            letterSpacing: '0.07em', textTransform: 'uppercase',
            cursor: 'pointer', transition: 'background 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#ddd'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
        >
          <Zap style={{ width: '13px', height: '13px' }} strokeWidth={2} />
          Quedarme en esta pestaña
        </button>

        <button
          onClick={onGoToOther}
          style={{
            width: '100%', padding: '11px 16px',
            borderRadius: '8px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            color: '#555', fontSize: '12px', fontWeight: 300,
            letterSpacing: '0.07em', textTransform: 'uppercase',
            cursor: 'pointer', transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
          }}
          onMouseEnter={e => {
            const b = e.currentTarget as HTMLButtonElement;
            b.style.background = 'rgba(255,255,255,0.07)';
            b.style.color = '#888';
          }}
          onMouseLeave={e => {
            const b = e.currentTarget as HTMLButtonElement;
            b.style.background = 'rgba(255,255,255,0.04)';
            b.style.color = '#555';
          }}
        >
          <Monitor style={{ width: '13px', height: '13px' }} strokeWidth={1.5} />
          Ir a la otra pestaña
        </button>
      </div>
    </div>
  </ModalShell>
);

// ══════════════════════════════════════════════════════════════════════════════
// AutoLogoutModal
// ══════════════════════════════════════════════════════════════════════════════

interface AutoLogoutModalProps {
  countdown:       number;
  totalSeconds:    number;
  onStayActive:    () => void;
}

export const AutoLogoutModal: React.FC<AutoLogoutModalProps> = ({
  countdown, totalSeconds, onStayActive,
}) => {
  const progress  = countdown / totalSeconds;
  const radius    = 26;
  const circumference = 2 * Math.PI * radius; // ~163.4
  const dashOffset = circumference * (1 - progress);

  // Color del anillo: verde → amarillo → rojo según tiempo restante
  const ringColor = countdown > totalSeconds * 0.5
    ? '#22c55e'
    : countdown > totalSeconds * 0.25
      ? '#f59e0b'
      : '#ef4444';

  return (
    <ModalShell>
      {/* Franja superior */}
      <div style={{
        height: '2px',
        background: ringColor,
        width: `${progress * 100}%`,
        transition: 'width 1s linear, background 1s linear',
      }} />

      <div style={{ padding: '28px 28px 24px', textAlign: 'center' }}>
        {/* Anillo SVG del countdown */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <div style={{ position: 'relative', width: '72px', height: '72px' }}>
            <svg width="72" height="72" style={{ transform: 'rotate(-90deg)' }}>
              {/* Track */}
              <circle
                cx="36" cy="36" r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="3"
              />
              {/* Progress */}
              <circle
                cx="36" cy="36" r={radius}
                fill="none"
                stroke={ringColor}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                style={{ transition: 'stroke-dashoffset 1s linear, stroke 1s linear' }}
              />
            </svg>
            {/* Número */}
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                color: ringColor, fontSize: '20px', fontWeight: 300,
                letterSpacing: '-0.02em', transition: 'color 1s linear',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {countdown}
              </span>
            </div>
          </div>
        </div>

        {/* Icono + texto */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Clock style={{ width: '15px', height: '15px', color: '#444' }} strokeWidth={1.5} />
          </div>
        </div>

        <p style={{
          color: '#c0c0c0', fontSize: '14px', fontWeight: 300,
          letterSpacing: '0.01em', marginBottom: '6px',
        }}>
          ¿Sigues ahí?
        </p>
        <p style={{
          color: '#333', fontSize: '12px', fontWeight: 300,
          letterSpacing: '0.02em', lineHeight: 1.6, marginBottom: '24px',
        }}>
          Por seguridad, cerraremos tu sesión en{' '}
          <span style={{ color: ringColor, transition: 'color 1s linear' }}>
            {countdown} segundo{countdown !== 1 ? 's' : ''}
          </span>{' '}
          por inactividad.
        </p>

        {/* Botones */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onStayActive}
            style={{
              flex: 1, padding: '11px',
              borderRadius: '8px',
              background: '#fff',
              border: 'none',
              color: '#000', fontSize: '12px', fontWeight: 400,
              letterSpacing: '0.07em', textTransform: 'uppercase',
              cursor: 'pointer', transition: 'background 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#ddd'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
          >
            Seguir conectado
          </button>

          <button
            onClick={() => {}} // llama onLogout directamente si quieres un botón manual
            style={{
              padding: '11px 16px',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: '#444', fontSize: '12px', fontWeight: 300,
              letterSpacing: '0.07em', textTransform: 'uppercase',
              cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
            onMouseEnter={e => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.background = 'rgba(239,68,68,0.08)';
              b.style.borderColor = 'rgba(239,68,68,0.2)';
              b.style.color = '#ef4444';
            }}
            onMouseLeave={e => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.background = 'rgba(255,255,255,0.03)';
              b.style.borderColor = 'rgba(255,255,255,0.06)';
              b.style.color = '#444';
            }}
          >
            <LogOut style={{ width: '13px', height: '13px' }} strokeWidth={1.5} />
            Salir
          </button>
        </div>
      </div>
    </ModalShell>
  );
};