/**
 * ScanAuthModal.tsx — Rediseñado
 * Secuencia post-login: ESCANEO → AUTORIZADO → BIENVENIDO → navigate
 * Fases:
 *   0 — "Verificando identidad"  (scan + datos + QR)   ~3.5 s
 *   1 — "Acceso autorizado"      (check animado)        ~1.0 s
 *   2 — "Bienvenido {name}"      (pantalla full)        ~1.8 s
 *   → onComplete()
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserProfile, UserRole } from '@/types';

const ROLE_LABELS: Record<string, string> = {
  CEO:            'CEO',
  Administración: 'Administración',
  Empleado:       'Empleado',
  Contador:       'Contador',
};

interface Props {
  user: UserProfile;
  onComplete: () => void;
}

const PHASE_DURATIONS = [3600, 900, 1800];

const ScanAuthModal: React.FC<Props> = ({ user, onComplete }) => {
  const [phase,   setPhase]   = useState(0);
  const [scanPct, setScanPct] = useState(0);
  const [qrReady, setQrReady] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const getOrCreatePayload = useCallback(async (): Promise<string> => {
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      const data = snap.data();
      if (data?.credentialPayload) return data.credentialPayload as string;
      const payload = JSON.stringify({ uid: user.uid, name: user.displayName, role: user.role });
      await updateDoc(doc(db, 'users', user.uid), { credentialPayload: payload });
      return payload;
    } catch {
      return JSON.stringify({ uid: user.uid, name: user.displayName, role: user.role });
    }
  }, [user]);

  const drawQR = useCallback(async () => {
    if (!qrCanvasRef.current) return;
    const payload = await getOrCreatePayload();
    const QRCode  = await import('qrcode');
    QRCode.toCanvas(qrCanvasRef.current, payload, {
      width:  120,
      margin: 1,
      color:  { dark: '#000000', light: '#ffffff' },
    }, (err) => { if (!err) setQrReady(true); });
  }, [getOrCreatePayload]);

  useEffect(() => {
    drawQR();
    const scanInterval = setInterval(() => {
      setScanPct(p => Math.min(p + 100 / (PHASE_DURATIONS[0] / 40), 100));
    }, 40);

    let t1: ReturnType<typeof setTimeout>;
    let t2: ReturnType<typeof setTimeout>;
    let t3: ReturnType<typeof setTimeout>;

    t1 = setTimeout(() => {
      clearInterval(scanInterval);
      setScanPct(100);
      setPhase(1);
      t2 = setTimeout(() => {
        setPhase(2);
        t3 = setTimeout(() => { onComplete(); }, PHASE_DURATIONS[2]);
      }, PHASE_DURATIONS[1]);
    }, PHASE_DURATIONS[0]);

    return () => {
      clearInterval(scanInterval);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [drawQR, onComplete]);

  const roleLabel = ROLE_LABELS[user.role as UserRole] ?? user.role;
  const initials  = (user.displayName ?? 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  // ══════════════════════════════════════════════════════════════════════════
  //  ESTILOS GLOBALES
  // ══════════════════════════════════════════════════════════════════════════
  const STYLES = `
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&family=Outfit:wght@200;300;400&display=swap');

    @keyframes _scanLine {
      0%      { top: 0%;   opacity: 1; }
      48%     { opacity: 1; }
      50%     { top: 100%; opacity: 0; }
      50.01%  { top: 0%;   opacity: 0; }
      52%     { opacity: 1; }
      100%    { top: 100%; opacity: 1; }
    }
    @keyframes _blink {
      0%,100% { opacity: 1; }
      50%     { opacity: 0; }
    }
    @keyframes _fadeSlideIn {
      from { opacity: 0; transform: translateX(-6px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes _checkDraw {
      from { stroke-dashoffset: 60; }
      to   { stroke-dashoffset: 0; }
    }
    @keyframes _authorizedPop {
      0%  { opacity: 0; transform: scale(0.88); }
      60% { transform: scale(1.03); }
      100%{ opacity: 1; transform: scale(1); }
    }
    @keyframes _welcomeFadeUp {
      from { opacity: 0; transform: translateY(20px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes _orbitPulse {
      0%,100% { opacity: 0.08; transform: translate(-50%,-50%) scale(1); }
      50%     { opacity: 0.18; transform: translate(-50%,-50%) scale(1.04); }
    }
    @keyframes _ringRotate {
      from { transform: translate(-50%,-50%) rotate(0deg); }
      to   { transform: translate(-50%,-50%) rotate(360deg); }
    }
    @keyframes _dotOrbit {
      from { transform: rotate(0deg)   translateX(80px) rotate(0deg); }
      to   { transform: rotate(360deg) translateX(80px) rotate(-360deg); }
    }
    @keyframes _dotOrbit2 {
      from { transform: rotate(120deg) translateX(130px) rotate(-120deg); }
      to   { transform: rotate(480deg) translateX(130px) rotate(-480deg); }
    }
    @keyframes _starTwinkle {
      0%,100% { opacity: 0.06; }
      50%     { opacity: 0.5; }
    }

    ._scan-line {
      position: absolute; left: 0; right: 0; height: 1px;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4) 40%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0.4) 60%, transparent);
      animation: _scanLine 2s linear infinite;
      pointer-events: none;
    }
    ._data-row   { animation: _fadeSlideIn 0.4s ease both; }
    ._blink      { animation: _blink 1s step-end infinite; }
    ._auth-pop   { animation: _authorizedPop 0.5s cubic-bezier(.4,0,.2,1) forwards; }
    ._check-draw {
      stroke-dasharray: 60;
      stroke-dashoffset: 60;
      animation: _checkDraw 0.5s ease 0.1s forwards;
    }
    ._welcome-1  { animation: _welcomeFadeUp 0.7s ease both; }
    ._welcome-2  { animation: _welcomeFadeUp 0.7s ease 0.15s both; }
    ._welcome-3  { animation: _welcomeFadeUp 0.7s ease 0.3s both; }
    ._welcome-4  { animation: _welcomeFadeUp 0.7s ease 0.45s both; }
  `;

  // ══════════════════════════════════════════════════════════════════════════
  //  FASE 2 — BIENVENIDO
  // ══════════════════════════════════════════════════════════════════════════
  if (phase === 2) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden"
        style={{ background: '#060608', fontFamily: 'Outfit, sans-serif' }}>
        <style>{STYLES}</style>

        {/* Orbital bg decoration */}
        <div style={{ position: 'absolute', top: '50%', left: '50%' }}>
          {/* Rings */}
          {[160, 260, 360].map((size, i) => (
            <div key={i} style={{
              position: 'absolute',
              width: `${size}px`, height: `${size}px`,
              marginLeft: `-${size/2}px`, marginTop: `-${size/2}px`,
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.04)',
              animation: `_orbitPulse ${3 + i * 1.5}s ease infinite`,
              animationDelay: `${i * 0.5}s`,
            }} />
          ))}
          {/* Orbiting dot */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            width: '4px', height: '4px', borderRadius: '50%', marginLeft: '-2px', marginTop: '-2px',
            background: 'rgba(255,255,255,0.4)',
            boxShadow: '0 0 8px rgba(255,255,255,0.3)',
            animation: '_dotOrbit 8s linear infinite',
          }} />
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            width: '3px', height: '3px', borderRadius: '50%', marginLeft: '-1.5px', marginTop: '-1.5px',
            background: 'rgba(255,255,255,0.25)',
            animation: '_dotOrbit2 14s linear infinite',
          }} />
        </div>

        {/* Star field */}
        {[15,25,35,45,55,65,75,85,10,20,40,60,80,90,5,50,30,70,95].map((x, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${x}%`, top: `${[20,65,10,80,35,15,70,45,50,90,55,25,85,10,75,5,40,60,30][i]}%`,
            width: '1px', height: '1px', borderRadius: '50%', background: 'white',
            animation: `_starTwinkle ${2 + (i % 3)}s ease-in-out ${(i * 0.3) % 3}s infinite`,
          }} />
        ))}

        {/* Vignette */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.7) 100%)', pointerEvents: 'none' }} />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center px-6 text-center">
          {/* Avatar */}
          <div className="_welcome-1" style={{
            width: '80px', height: '80px', borderRadius: '24px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '28px', overflow: 'hidden',
            boxShadow: '0 0 40px rgba(255,255,255,0.04)',
          }}>
            {user.avatar
              ? <img src={user.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '22px', fontWeight: 300, fontFamily: 'Cormorant Garamond, serif' }}>{initials}</span>
            }
          </div>

          {/* Acceso concedido */}
          <p className="_welcome-2" style={{
            fontFamily: 'Outfit, sans-serif',
            fontSize: '10px', fontWeight: 300,
            letterSpacing: '0.45em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.2)', marginBottom: '12px',
          }}>
            Acceso concedido
          </p>

          {/* Nombre */}
          <h1 className="_welcome-3" style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: 'clamp(28px, 6vw, 42px)',
            fontWeight: 300,
            letterSpacing: '0.04em',
            color: 'rgba(255,255,255,0.88)',
            marginBottom: '6px',
            lineHeight: 1.1,
          }}>
            {user.displayName}
          </h1>

          <p className="_welcome-3" style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: 'clamp(14px, 3vw, 18px)',
            fontWeight: 300,
            fontStyle: 'italic',
            color: 'rgba(255,255,255,0.25)',
            marginBottom: '28px',
          }}>
            Bienvenido de vuelta
          </p>

          {/* Role pill */}
          <div className="_welcome-4" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '6px 16px', borderRadius: '100px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <span style={{
              width: '5px', height: '5px', borderRadius: '50%',
              background: 'rgba(255,255,255,0.3)', display: 'inline-block',
            }} />
            <span style={{
              fontFamily: 'Outfit, sans-serif',
              fontSize: '10px', fontWeight: 300,
              letterSpacing: '0.2em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.3)',
            }}>
              {roleLabel} · Moon Studios
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  FASE 0 + 1 — ESCANEO / AUTORIZADO
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: '#060608', fontFamily: 'Outfit, sans-serif' }}>
      <style>{STYLES}</style>

      {/* ── FASE 1: AUTORIZADO overlay ── */}
      {phase === 1 && (
        <div className="_auth-pop absolute inset-0 flex flex-col items-center justify-center z-10"
          style={{ background: '#060608' }}>
          <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
            <circle cx="36" cy="36" r="32" stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
            <circle cx="36" cy="36" r="32" stroke="rgba(255,255,255,0.04)" strokeWidth="1"
              strokeDasharray="5 5"/>
            <polyline
              points="22,37 32,47 50,28"
              stroke="rgba(255,255,255,0.7)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              className="_check-draw"
            />
          </svg>
          <p style={{
            marginTop: '20px',
            fontFamily: 'Outfit, sans-serif',
            fontSize: '10px', fontWeight: 300,
            letterSpacing: '0.45em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.2)',
          }}>
            Acceso Autorizado
          </p>
        </div>
      )}

      {/* ── FASE 0: PANEL DE ESCANEO ── */}
      <div style={{
        opacity: phase === 1 ? 0 : 1,
        transition: 'opacity 0.3s ease',
        width: '100%', maxWidth: '640px',
        borderRadius: '20px',
        border: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(10,10,12,0.98)',
        overflow: 'hidden',
        boxShadow: '0 40px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03)',
      }}>

        {/* Header bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '5px' }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
              ))}
            </div>
            <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '9px', fontWeight: 300, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.15)' }}>
              Moon Studios · Auth System
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div className="_blink" style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)' }} />
            <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '9px', fontWeight: 300, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.15)' }}>LIVE</span>
          </div>
        </div>

        {/* Body — responsive: stack on mobile, side-by-side on tablet+ */}
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>

          {/* Left: datos */}
          <div style={{
            flex: '1 1 280px',
            padding: '20px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}>
            {/* Title */}
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '9px', fontWeight: 300, letterSpacing: '0.4em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.15)', marginBottom: '6px' }}>
                Iniciando escaneo
              </p>
              <h2 style={{
                fontFamily: 'Cormorant Garamond, serif',
                fontSize: '20px', fontWeight: 300,
                color: 'rgba(255,255,255,0.75)', letterSpacing: '0.02em',
              }}>
                Verificando Identidad
                <span className="_blink" style={{ color: 'rgba(255,255,255,0.2)', marginLeft: '2px' }}>_</span>
              </h2>
            </div>

            {/* Avatar + nombre */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
              <div style={{
                position: 'relative', width: '48px', height: '48px', borderRadius: '14px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', flexShrink: 0,
              }}>
                {user.avatar
                  ? <img src={user.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontFamily: 'Cormorant Garamond, serif', color: 'rgba(255,255,255,0.4)', fontSize: '14px', fontWeight: 300 }}>{initials}</span>
                }
                <div className="absolute inset-0 overflow-hidden" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                  <div className="_scan-line" />
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '13px', fontWeight: 300, color: 'rgba(255,255,255,0.7)', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.displayName}
                </p>
                <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '10px', fontWeight: 300, color: 'rgba(255,255,255,0.2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.email}
                </p>
              </div>
            </div>

            {/* Data rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {[
                { label: 'UID',       value: user.uid.slice(0, 14) + '…' },
                { label: 'Rol',       value: roleLabel },
                { label: 'Estado',    value: 'AUTORIZADO', bright: true },
                { label: 'Protocolo', value: 'LUNANET · v2.0' },
                { label: 'Sesión',    value: new Date().toLocaleTimeString('es-PE') },
              ].map(({ label, value, bright }, i) => (
                <div key={label} className="_data-row" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                  animationDelay: `${i * 0.12}s`,
                }}>
                  <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '9px', fontWeight: 300, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.15)', flexShrink: 0 }}>
                    {label}
                  </span>
                  <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '10px', fontWeight: 300, letterSpacing: '0.05em', color: bright ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.2)', textAlign: 'right' }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '9px', fontWeight: 300, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.12)' }}>
                  Progreso
                </span>
                <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '9px', color: 'rgba(255,255,255,0.15)' }}>
                  {Math.round(scanPct)}%
                </span>
              </div>
              <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', borderRadius: '1px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: '1px', transition: 'width 0.1s linear',
                  width: `${scanPct}%`,
                  background: 'linear-gradient(90deg, rgba(255,255,255,0.1), rgba(255,255,255,0.5))',
                }} />
              </div>
            </div>
          </div>

          {/* Right: QR — se oculta en móvil muy pequeño, aparece desde sm */}
          <div style={{
            flex: '0 0 auto',
            padding: '20px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px',
            borderLeft: '1px solid rgba(255,255,255,0.04)',
            minWidth: '160px',
          }}
          className="hidden sm:flex"
          >
            <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '9px', fontWeight: 300, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.15)' }}>
              Código QR
            </p>

            {/* QR wrapper */}
            <div style={{ position: 'relative', padding: '8px', borderRadius: '12px', background: '#ffffff' }}>
              <canvas ref={qrCanvasRef} style={{ display: qrReady ? 'block' : 'none', borderRadius: '4px' }} />
              {!qrReady && (
                <div style={{ width: '120px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: '20px', height: '20px', border: '1.5px solid #ddd', borderTopColor: '#333', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  <style>{'@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}'}</style>
                </div>
              )}
              {qrReady && (
                <div style={{ position: 'absolute', inset: 0, borderRadius: '12px', overflow: 'hidden' }}>
                  <div className="_scan-line" style={{ opacity: 0.4 }} />
                </div>
              )}
              {/* Corner brackets */}
              {[
                { top: 4, left: 4,    borderTop: '2px solid rgba(0,0,0,0.2)', borderLeft: '2px solid rgba(0,0,0,0.2)' },
                { top: 4, right: 4,   borderTop: '2px solid rgba(0,0,0,0.2)', borderRight: '2px solid rgba(0,0,0,0.2)' },
                { bottom: 4, left: 4, borderBottom: '2px solid rgba(0,0,0,0.2)', borderLeft: '2px solid rgba(0,0,0,0.2)' },
                { bottom: 4, right: 4,borderBottom: '2px solid rgba(0,0,0,0.2)', borderRight: '2px solid rgba(0,0,0,0.2)' },
              ].map((s, i) => (
                <div key={i} style={{ position: 'absolute', width: '12px', height: '12px', ...s as React.CSSProperties }} />
              ))}
            </div>

            <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '8px', fontWeight: 300, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.12)', textAlign: 'center', maxWidth: '120px' }}>
              {user.uid.slice(0, 10).toUpperCase()}…
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 20px',
          borderTop: '1px solid rgba(255,255,255,0.04)',
        }}>
          <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '8px', fontWeight: 300, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.1)' }}>
            Moon Studios · Sistema Seguro
          </span>
          <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '8px', color: 'rgba(255,255,255,0.1)' }}>
            {new Date().toLocaleDateString('es-PE')} · {new Date().toLocaleTimeString('es-PE')}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ScanAuthModal;