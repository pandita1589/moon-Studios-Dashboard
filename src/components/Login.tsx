import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser, getUserProfile, resetUserPassword } from '@/lib/firebase';
import { Eye, EyeOff } from 'lucide-react';
import ScanAuthModal from '@/components/Scanauthmodal';
import type { UserProfile } from '@/types';

const LOGO_LIGHT = 'https://ufvebjscabomuayqtyyo.supabase.co/storage/v1/object/public/task-reports/MARCA%20DE%20AGUA%20BLANCO.png ';
const LOGO_DARK  = 'https://ufvebjscabomuayqtyyo.supabase.co/storage/v1/object/public/task-reports/MARCA%20DE%20AGUA.png ';

const useIsDark = () => {
  const [isDark, setIsDark] = React.useState(
    () => !document.documentElement.classList.contains('light')
  );
  React.useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(!document.documentElement.classList.contains('light'))
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
};

const OrbitalCanvas: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
    <style>{`
      @keyframes orbit1 {
        from { transform: rotate(0deg) translateX(120px) rotate(0deg); }
        to   { transform: rotate(360deg) translateX(120px) rotate(-360deg); }
      }
      @keyframes orbit2 {
        from { transform: rotate(120deg) translateX(200px) rotate(-120deg); }
        to   { transform: rotate(480deg) translateX(200px) rotate(-480deg); }
      }
      @keyframes orbit3 {
        from { transform: rotate(240deg) translateX(280px) rotate(-240deg); }
        to   { transform: rotate(600deg) translateX(280px) rotate(-600deg); }
      }
      @keyframes orbit4 {
        from { transform: rotate(60deg) translateX(160px) rotate(-60deg); }
        to   { transform: rotate(420deg) translateX(160px) rotate(-420deg); }
      }
      @keyframes orbit5 {
        from { transform: rotate(300deg) translateX(240px) rotate(-300deg); }
        to   { transform: rotate(660deg) translateX(240px) rotate(-660deg); }
      }
      @keyframes orbit6 {
        from { transform: rotate(180deg) translateX(340px) rotate(-180deg); }
        to   { transform: rotate(540deg) translateX(340px) rotate(-540deg); }
      }
      @keyframes moonPulse {
        0%, 100% { opacity: 0.6; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.04); }
      }
      @keyframes ringRotate {
        from { transform: translate(-50%,-50%) rotate(0deg); }
        to   { transform: translate(-50%,-50%) rotate(360deg); }
      }
      @keyframes ringRotateRev {
        from { transform: translate(-50%,-50%) rotate(0deg); }
        to   { transform: translate(-50%,-50%) rotate(-360deg); }
      }
      @keyframes starTwinkle {
        0%,100% { opacity: 0.1; }
        50% { opacity: 0.7; }
      }
      .orbit-dot {
        position: absolute;
        top: 50%; left: 50%;
        width: 5px; height: 5px;
        border-radius: 50%;
        margin: -2.5px;
        background: rgba(255,255,255,0.7);
        box-shadow: 0 0 8px rgba(255,255,255,0.5);
      }
      .orbit-dot-sm {
        width: 3px; height: 3px;
        margin: -1.5px;
        background: rgba(255,255,255,0.4);
        box-shadow: 0 0 4px rgba(255,255,255,0.3);
      }
      .orbit-dot-lg {
        width: 7px; height: 7px;
        margin: -3.5px;
        background: rgba(255,255,255,0.9);
        box-shadow: 0 0 16px rgba(255,255,255,0.6), 0 0 32px rgba(255,255,255,0.2);
      }
    `}</style>

    <div style={{
      position: 'absolute', inset: 0,
      background: 'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.03) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(255,255,255,0.02) 0%, transparent 50%)',
    }} />

    {[
      [15,20],[25,65],[35,10],[45,80],[55,35],[65,15],[75,70],[85,45],
      [10,50],[20,90],[40,55],[60,25],[80,85],[90,10],[5,75],[50,5],
      [30,40],[70,60],[95,30],[12,35],[88,55],[42,95],[68,5],[22,75],
    ].map(([x, y], i) => (
      <div key={i} style={{
        position: 'absolute',
        left: `${x}%`, top: `${y}%`,
        width: i % 3 === 0 ? '2px' : '1px',
        height: i % 3 === 0 ? '2px' : '1px',
        borderRadius: '50%',
        background: 'white',
        animation: `starTwinkle ${2 + (i % 3)}s ease-in-out ${(i * 0.3) % 3}s infinite`,
      }} />
    ))}

    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '48px', height: '48px',
        borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.15), rgba(255,255,255,0.04))',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 0 40px rgba(255,255,255,0.06), inset 0 0 20px rgba(255,255,255,0.04)',
        animation: 'moonPulse 4s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: '240px', height: '240px', marginLeft: '-120px', marginTop: '-120px',
        borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.06)',
        animation: 'ringRotate 20s linear infinite',
      }}>
        <div className="orbit-dot orbit-dot-lg" style={{ animation: 'orbit1 20s linear infinite' }} />
        <div className="orbit-dot orbit-dot-sm" style={{ animation: 'orbit1 20s linear infinite', animationDelay: '-10s', opacity: 0.5 }} />
      </div>
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: '400px', height: '400px', marginLeft: '-200px', marginTop: '-200px',
        borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.04)',
        animation: 'ringRotateRev 32s linear infinite',
      }}>
        <div className="orbit-dot" style={{ animation: 'orbit2 32s linear infinite' }} />
        <div className="orbit-dot orbit-dot-sm" style={{ animation: 'orbit2 32s linear infinite', animationDelay: '-16s' }} />
        <div className="orbit-dot orbit-dot-sm" style={{ animation: 'orbit2 32s linear infinite', animationDelay: '-8s', opacity: 0.4 }} />
      </div>
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: '560px', height: '560px', marginLeft: '-280px', marginTop: '-280px',
        borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.025)',
        animation: 'ringRotate 48s linear infinite',
      }}>
        <div className="orbit-dot orbit-dot-lg" style={{ animation: 'orbit3 48s linear infinite' }} />
        <div className="orbit-dot orbit-dot-sm" style={{ animation: 'orbit3 48s linear infinite', animationDelay: '-24s', opacity: 0.3 }} />
        <div className="orbit-dot" style={{ animation: 'orbit3 48s linear infinite', animationDelay: '-12s', opacity: 0.5 }} />
      </div>
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: '320px', height: '320px', marginLeft: '-160px', marginTop: '-160px',
        borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.03)',
        transform: 'rotate(45deg)',
        animation: 'ringRotateRev 25s linear infinite',
      }}>
        <div className="orbit-dot orbit-dot-sm" style={{ animation: 'orbit4 25s linear infinite' }} />
      </div>
    </div>

    <div style={{
      position: 'absolute', inset: 0,
      background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)',
    }} />
  </div>
);

const Login: React.FC = () => {
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPass,     setShowPass]     = useState(false);
  const [error,        setError]        = useState('');
  const [loading,      setLoading]      = useState(false);
  const [focused,      setFocused]      = useState<string | null>(null);
  const [shake,        setShake]        = useState(false);
  const [mounted,      setMounted]      = useState(false);
  const [authedUser,   setAuthedUser]   = useState<UserProfile | null>(null);
  const [view,         setView]         = useState<'login' | 'forgot'>('login');
  const [resetEmail,   setResetEmail]   = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent,    setResetSent]    = useState(false);
  const [resetError,   setResetError]   = useState('');
  const navigate = useNavigate();
  const isDark = useIsDark();

  useEffect(() => { setTimeout(() => setMounted(true), 50); }, []);

  const triggerShake = () => { setShake(true); setTimeout(() => setShake(false), 600); };

  const validate = () => {
    if (!email && !password) { setError('Correo y contraseña requeridos'); triggerShake(); return false; }
    if (!email) { setError('Ingresa tu correo electrónico'); triggerShake(); return false; }
    if (!password) { setError('Ingresa tu contraseña'); triggerShake(); return false; }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;
    setLoading(true);
    try {
      const cred    = await loginUser(email, password);
      const profile = await getUserProfile(cred.user.uid);
      if (!profile) { setError('Perfil no encontrado.'); setLoading(false); return; }
      setAuthedUser({
        uid:         cred.user.uid,
        email:       profile.email,
        displayName: profile.displayName,
        role:        profile.role,
        avatar:      profile.avatar,
        phone:       profile.phone,
        createdAt:   profile.createdAt?.toDate ? profile.createdAt.toDate() : new Date(),
      });
    } catch {
      setError('Credenciales incorrectas. Inténtalo de nuevo.');
      triggerShake();
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    if (!resetEmail.trim()) {
      setResetError('Ingresa tu correo electrónico');
      setShake(true); setTimeout(() => setShake(false), 600);
      return;
    }
    setResetLoading(true);
    try {
      await resetUserPassword(resetEmail.trim());
      setResetSent(true);
    } catch (err: any) {
      if (err?.code === 'auth/invalid-email') {
        setResetError('El formato del correo no es válido.');
      } else {
        setResetSent(true);
      }
    } finally {
      setResetLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setView('login');
    setResetEmail('');
    setResetSent(false);
    setResetError('');
  };

  const bg           = isDark ? '#060608' : '#f2f1ee';
  const panelBg      = isDark ? '#08080a' : '#0c0c10';
  const textPrim     = isDark ? '#e8e8e8' : '#111';
  const textMuted    = isDark ? '#3a3a3a' : '#aaa';
  const textSub      = isDark ? '#555' : '#999';
  const inputBorder  = (f: string) => focused === f
    ? isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.5)'
    : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)';
  const inputBg      = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&family=Outfit:wght@200;300;400&display=swap');
        @keyframes loginFadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes loginFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes loginShake {
          0%,100% { transform: translateX(0); }
          15%,45%,75% { transform: translateX(-6px); }
          30%,60%,90% { transform: translateX(6px); }
        }
        @keyframes errorSlide {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes btnShimmer {
          from { transform: translateX(-100%) skewX(-20deg); }
          to   { transform: translateX(300%) skewX(-20deg); }
        }
        @keyframes scanLine {
          from { transform: translateY(-100%); opacity: 0; }
          50%  { opacity: 1; }
          to   { transform: translateY(100vh); opacity: 0; }
        }
        @keyframes successIn {
          from { opacity: 0; transform: scale(0.9); }
          to   { opacity: 1; transform: scale(1); }
        }
        .login-root { font-family: 'Outfit', sans-serif; }
        .login-heading { font-family: 'Cormorant Garamond', Georgia, serif; }
        .login-panel-enter { animation: loginFadeIn 1.2s cubic-bezier(0.22,1,0.36,1) forwards; }
        .login-form-enter { animation: loginFadeUp 0.8s cubic-bezier(0.22,1,0.36,1) 0.2s both; }
        .login-shake { animation: loginShake 0.6s cubic-bezier(0.36,0.07,0.19,0.97); }
        .login-input {
          font-family: 'Outfit', sans-serif;
          font-weight: 300;
          letter-spacing: 0.02em;
          transition: border-color 0.3s ease, background 0.3s ease;
          color: inherit;
        }
        .login-input::placeholder { opacity: 0.3; }
        .login-input:-webkit-autofill,
        .login-input:-webkit-autofill:hover,
        .login-input:-webkit-autofill:focus,
        .login-input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 1000px #111114 inset !important;
          -webkit-text-fill-color: #e8e8e8 !important;
          caret-color: #e8e8e8 !important;
          transition: background-color 9999s ease;
        }
        .login-btn {
          position: relative; overflow: hidden;
          font-family: 'Outfit', sans-serif;
          letter-spacing: 0.15em;
          transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s;
        }
        .login-btn:not(:disabled):hover { transform: translateY(-2px); }
        .login-btn:not(:disabled):active { transform: translateY(0); }
        .login-btn-shimmer {
          position: absolute; top: 0; left: 0;
          width: 40%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
          animation: btnShimmer 3s ease-in-out 1s infinite;
        }
        .scan-line {
          position: absolute; left: 0; right: 0; height: 2px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
          animation: scanLine 8s ease-in-out 2s infinite;
          pointer-events: none;
        }
        .field-label {
          font-family: 'Outfit', sans-serif;
          font-size: 10px;
          font-weight: 300;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          transition: color 0.3s;
        }
        .deco-line::before {
          content: '';
          display: block;
          width: 24px; height: 1px;
          background: rgba(255,255,255,0.15);
          margin-bottom: 20px;
        }
        .reset-success-in { animation: successIn 0.5s cubic-bezier(0.22,1,0.36,1) forwards; }
      `}</style>

      {authedUser && <ScanAuthModal user={authedUser} onComplete={() => navigate('/dashboard')} />}

      {/* ── CAMBIO CLAVE: height: '100%' en vez de min-h-screen ── */}
      <div className="login-root flex overflow-hidden" style={{ background: bg, height: '100%' }}>

        {/* Panel izquierdo */}
        <div
          className="hidden lg:flex flex-col justify-between relative overflow-hidden login-panel-enter"
          style={{
            width: '48%',
            background: `linear-gradient(160deg, ${panelBg} 0%, #050507 60%, #0a0a0f 100%)`,
            borderRight: '1px solid rgba(255,255,255,0.04)',
          }}
        >
          <div className="scan-line" />
          <OrbitalCanvas />
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.03,
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundSize: '120px',
          }} />
          <div className="relative z-10 p-10">
            <img src={LOGO_LIGHT} alt="Moon Studios"
              style={{ height: '40px', width: 'auto', objectFit: 'contain', opacity: 0.9 }}
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
          <div className="relative z-10 p-10 deco-line">
            <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '28px', fontWeight: 300, lineHeight: 1.3, color: 'rgba(255,255,255,0.12)', letterSpacing: '0.01em' }}>
              Panel de control<br />
              <em style={{ color: 'rgba(255,255,255,0.07)' }}>Moon Studios</em>
            </p>
            <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '10px', fontWeight: 300, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.1)', marginTop: '12px' }}>
              Acceso restringido · Personal autorizado
            </p>
          </div>
        </div>

        {/* Panel derecho — scroll interno si hace falta */}
        <div className="flex-1 flex flex-col items-center justify-center relative overflow-y-auto">
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: isDark
              ? 'radial-gradient(ellipse at 60% 40%, rgba(255,255,255,0.015) 0%, transparent 60%)'
              : 'radial-gradient(ellipse at 60% 40%, rgba(0,0,0,0.02) 0%, transparent 60%)',
          }} />

          <div className={`relative w-full max-w-[380px] px-8 md:px-0 ${mounted ? 'login-form-enter' : 'opacity-0'} ${shake ? 'login-shake' : ''}`}>

            <div className="lg:hidden flex justify-center mb-10">
              <img src={isDark ? LOGO_LIGHT : LOGO_DARK} alt="Moon Studios"
                style={{ height: '48px', width: 'auto', objectFit: 'contain' }}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            </div>

            {view === 'login' && (
              <>
                <div className="mb-10">
                  <div style={{ width: '20px', height: '1px', background: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)', marginBottom: '16px' }} />
                  <h1 className="login-heading" style={{ fontSize: '34px', fontWeight: 300, lineHeight: 1.15, color: textPrim, marginBottom: '8px', letterSpacing: '-0.01em' }}>
                    Bienvenido
                  </h1>
                  <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '12px', fontWeight: 300, letterSpacing: '0.05em', color: textSub }}>
                    Ingresa tus credenciales para continuar
                  </p>
                </div>

                {error && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '24px', padding: '12px 14px', borderRadius: '12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', animation: 'errorSlide 0.3s ease-out' }}>
                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#ef4444', marginTop: '5px', flexShrink: 0 }} />
                    <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '12px', fontWeight: 300, color: isDark ? '#fca5a5' : '#dc2626', lineHeight: 1.5 }}>{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div>
                    <label className="field-label" style={{ color: focused === 'email' ? textPrim : textMuted, display: 'block', marginBottom: '8px' }}>Correo electrónico</label>
                    <div style={{ position: 'relative', borderRadius: '12px', border: `1px solid ${inputBorder('email')}`, background: inputBg, transition: 'border-color 0.3s, background 0.3s' }}>
                      <input className="login-input" id="email" type="email" value={email}
                        onChange={e => setEmail(e.target.value)}
                        onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
                        autoComplete="email" placeholder="tu@moonStudios.com"
                        style={{ width: '100%', background: 'transparent', outline: 'none', border: 'none', padding: '13px 16px', fontSize: '13px', color: textPrim, caretColor: textPrim, WebkitTextFillColor: textPrim }}
                      />
                      {focused === 'email' && <div style={{ position: 'absolute', inset: -1, borderRadius: '13px', pointerEvents: 'none', boxShadow: isDark ? '0 0 0 3px rgba(255,255,255,0.04)' : '0 0 0 3px rgba(0,0,0,0.04)' }} />}
                    </div>
                  </div>

                  <div>
                    <label className="field-label" style={{ color: focused === 'password' ? textPrim : textMuted, display: 'block', marginBottom: '8px' }}>Contraseña</label>
                    <div style={{ position: 'relative', borderRadius: '12px', border: `1px solid ${inputBorder('password')}`, background: inputBg, transition: 'border-color 0.3s, background 0.3s' }}>
                      <input className="login-input" id="password"
                        type={showPass ? 'text' : 'password'} value={password}
                        onChange={e => setPassword(e.target.value)}
                        onFocus={() => setFocused('password')} onBlur={() => setFocused(null)}
                        autoComplete="current-password" placeholder="••••••••••"
                        style={{ width: '100%', background: 'transparent', outline: 'none', border: 'none', padding: '13px 44px 13px 16px', fontSize: '13px', color: textPrim, caretColor: textPrim, WebkitTextFillColor: textPrim }}
                      />
                      <button type="button" tabIndex={-1} onClick={() => setShowPass(s => !s)}
                        style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: textMuted, padding: '4px', transition: 'color 0.2s', display: 'flex', alignItems: 'center' }}
                        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = textPrim}
                        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = textMuted}
                      >
                        {showPass ? <EyeOff style={{ width: '14px', height: '14px' }} /> : <Eye style={{ width: '14px', height: '14px' }} />}
                      </button>
                      {focused === 'password' && <div style={{ position: 'absolute', inset: -1, borderRadius: '13px', pointerEvents: 'none', boxShadow: isDark ? '0 0 0 3px rgba(255,255,255,0.04)' : '0 0 0 3px rgba(0,0,0,0.04)' }} />}
                    </div>
                  </div>

                  <div style={{ paddingTop: '8px' }}>
                    <button type="submit" disabled={loading} className="login-btn"
                      style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', fontSize: '11px', fontWeight: 300, textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer', background: loading ? (isDark ? '#1a1a1a' : '#e0e0e0') : (isDark ? '#ffffff' : '#0c0c0c'), color: loading ? (isDark ? '#3a3a3a' : '#aaa') : (isDark ? '#000000' : '#ffffff') }}
                    >
                      {!loading && <div className="login-btn-shimmer" />}
                      <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        {loading ? (
                          <>
                            <svg style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none">
                              <style>{'@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
                              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                            Verificando
                          </>
                        ) : 'Ingresar'}
                      </span>
                    </button>

                    <div style={{ textAlign: 'center', marginTop: '16px' }}>
                      <button type="button"
                        onClick={() => { setView('forgot'); setResetEmail(email); setError(''); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontSize: '11px', fontWeight: 300, letterSpacing: '0.08em', color: isDark ? '#3a3a3a' : '#bbb', transition: 'color 0.2s', padding: '4px' }}
                        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = isDark ? '#888' : '#666'}
                        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = isDark ? '#3a3a3a' : '#bbb'}
                      >
                        ¿Olvidaste tu contraseña?
                      </button>
                    </div>
                  </div>
                </form>
              </>
            )}

            {view === 'forgot' && (
              <>
                <button type="button" onClick={handleBackToLogin}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '32px', padding: 0, fontFamily: 'Outfit, sans-serif', fontSize: '11px', fontWeight: 300, letterSpacing: '0.12em', textTransform: 'uppercase', color: isDark ? '#3a3a3a' : '#bbb', transition: 'color 0.2s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = isDark ? '#888' : '#555'}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = isDark ? '#3a3a3a' : '#bbb'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 5l-7 7 7 7"/>
                  </svg>
                  Volver al login
                </button>

                {!resetSent ? (
                  <>
                    <div className="mb-10">
                      <div style={{ width: '20px', height: '1px', background: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)', marginBottom: '16px' }} />
                      <h1 className="login-heading" style={{ fontSize: '30px', fontWeight: 300, lineHeight: 1.2, color: textPrim, marginBottom: '8px', letterSpacing: '-0.01em' }}>
                        Restablecer<br />contraseña
                      </h1>
                      <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '12px', fontWeight: 300, letterSpacing: '0.03em', color: textSub, lineHeight: 1.6 }}>
                        Te enviaremos un enlace para restablecer tu contraseña.
                      </p>
                    </div>

                    {resetError && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '24px', padding: '12px 14px', borderRadius: '12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', animation: 'errorSlide 0.3s ease-out' }}>
                        <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#ef4444', marginTop: '5px', flexShrink: 0 }} />
                        <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '12px', fontWeight: 300, color: isDark ? '#fca5a5' : '#dc2626', lineHeight: 1.5 }}>{resetError}</p>
                      </div>
                    )}

                    <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                      <div>
                        <label className="field-label" style={{ color: focused === 'resetEmail' ? textPrim : textMuted, display: 'block', marginBottom: '8px' }}>Correo electrónico</label>
                        <div style={{ position: 'relative', borderRadius: '12px', border: `1px solid ${focused === 'resetEmail' ? (isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.5)') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)')}`, background: inputBg, transition: 'border-color 0.3s, background 0.3s' }}>
                          <input className="login-input" type="email" value={resetEmail}
                            onChange={e => setResetEmail(e.target.value)}
                            onFocus={() => setFocused('resetEmail')} onBlur={() => setFocused(null)}
                            autoComplete="email" placeholder="tu@moonStudios.com" autoFocus
                            style={{ width: '100%', background: 'transparent', outline: 'none', border: 'none', padding: '13px 16px', fontSize: '13px', color: textPrim, caretColor: textPrim, WebkitTextFillColor: textPrim }}
                          />
                          {focused === 'resetEmail' && <div style={{ position: 'absolute', inset: -1, borderRadius: '13px', pointerEvents: 'none', boxShadow: isDark ? '0 0 0 3px rgba(255,255,255,0.04)' : '0 0 0 3px rgba(0,0,0,0.04)' }} />}
                        </div>
                      </div>

                      <div style={{ paddingTop: '8px' }}>
                        <button type="submit" disabled={resetLoading} className="login-btn"
                          style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', fontSize: '11px', fontWeight: 300, textTransform: 'uppercase', cursor: resetLoading ? 'not-allowed' : 'pointer', background: resetLoading ? (isDark ? '#1a1a1a' : '#e0e0e0') : (isDark ? '#ffffff' : '#0c0c0c'), color: resetLoading ? (isDark ? '#3a3a3a' : '#aaa') : (isDark ? '#000000' : '#ffffff') }}
                        >
                          {!resetLoading && <div className="login-btn-shimmer" />}
                          <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            {resetLoading ? (
                              <>
                                <svg style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none">
                                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
                                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                </svg>
                                Enviando
                              </>
                            ) : 'Enviar enlace'}
                          </span>
                        </button>
                      </div>
                    </form>
                  </>
                ) : (
                  <div className="reset-success-in" style={{ textAlign: 'center', paddingTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '28px' }}>
                      <div style={{ width: '56px', height: '56px', borderRadius: '18px', background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={isDark ? '#e8e8e8' : '#111'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="4" width="20" height="16" rx="3"/>
                          <path d="m2 7 10 7 10-7"/>
                        </svg>
                      </div>
                    </div>
                    <h2 className="login-heading" style={{ fontSize: '26px', fontWeight: 300, color: textPrim, marginBottom: '12px', lineHeight: 1.2 }}>
                      Revisa tu correo
                    </h2>
                    <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '12px', fontWeight: 300, color: textSub, lineHeight: 1.8, marginBottom: '32px' }}>
                      Si existe una cuenta asociada a<br />
                      <span style={{ color: isDark ? '#666' : '#888', fontStyle: 'italic' }}>{resetEmail}</span>,<br />
                      recibirás un enlace para restablecer tu contraseña.
                    </p>
                    <div style={{ height: '1px', background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)', marginBottom: '24px' }} />
                    <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '11px', fontWeight: 300, color: isDark ? '#2a2a2a' : '#ccc', letterSpacing: '0.06em', marginBottom: '20px' }}>
                      ¿No recibiste el correo? Revisa spam o
                    </p>
                    <button type="button"
                      onClick={() => setResetSent(false)}
                      style={{ background: 'none', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'}`, borderRadius: '10px', cursor: 'pointer', padding: '10px 20px', fontFamily: 'Outfit, sans-serif', fontSize: '11px', fontWeight: 300, letterSpacing: '0.12em', textTransform: 'uppercase', color: isDark ? '#555' : '#999', transition: 'all 0.2s' }}
                      onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'; b.style.color = isDark ? '#888' : '#666'; }}
                      onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'none'; b.style.color = isDark ? '#555' : '#999'; }}
                    >
                      Intentar de nuevo
                    </button>
                  </div>
                )}
              </>
            )}

            <div style={{ marginTop: '48px', textAlign: 'center' }}>
              <div style={{ width: '100%', height: '1px', marginBottom: '16px', background: isDark ? 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)' : 'linear-gradient(90deg, transparent, rgba(0,0,0,0.08), transparent)' }} />
              <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '10px', fontWeight: 300, letterSpacing: '0.2em', textTransform: 'uppercase', color: isDark ? '#1e1e1e' : '#ccc' }}>
                Moon Studios · Acceso Autorizado
              </p>
            </div>

          </div>
        </div>

      </div>
    </>
  );
};

export default Login;