// src/hooks/useAutoLogout.ts
//
// Detecta inactividad y cierra sesión automáticamente.
//
// Flujo:
//   - El usuario no hace nada por IDLE_MINUTES → aparece modal de advertencia
//   - El modal tiene un contador regresivo de WARNING_SECONDS
//   - Si el usuario hace click/tecla → se resetea el timer silenciosamente
//   - Si el contador llega a 0 → logout automático
//
// Para cambiar los tiempos, edita IDLE_MINUTES y WARNING_SECONDS abajo.

import { useEffect, useState, useCallback, useRef } from 'react';

// ── Configuración ─────────────────────────────────────────────────────────────
const IDLE_MINUTES    = 30;  // minutos sin actividad antes de mostrar advertencia
const WARNING_SECONDS = 60;  // segundos del contador regresivo antes de cerrar sesión

// Eventos que cuentan como "actividad"
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];

interface UseAutoLogoutResult {
  showWarning:    boolean;
  countdown:      number;
  handleStayActive: () => void;
}

export function useAutoLogout(
  isAuthenticated: boolean,
  onLogout: () => Promise<void>
): UseAutoLogoutResult {
  const [showWarning, setShowWarning]   = useState(false);
  const [countdown,   setCountdown]     = useState(WARNING_SECONDS);

  const idleTimerRef     = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isWarningRef     = useRef(false);

  const clearTimers = () => {
    if (idleTimerRef.current)      clearTimeout(idleTimerRef.current);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
  };

  const startCountdown = useCallback(() => {
    isWarningRef.current = true;
    setCountdown(WARNING_SECONDS);
    setShowWarning(true);

    let remaining = WARNING_SECONDS;
    countdownTimerRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownTimerRef.current!);
        setShowWarning(false);
        onLogout();
      }
    }, 1000);
  }, [onLogout]);

  const resetIdleTimer = useCallback(() => {
    // Si el modal ya está abierto, no resetear con movimiento de mouse
    // (el usuario debe hacer clic explícitamente en "Seguir conectado")
    if (isWarningRef.current) return;

    clearTimers();
    idleTimerRef.current = setTimeout(() => {
      startCountdown();
    }, IDLE_MINUTES * 60 * 1000);
  }, [startCountdown]);

  const handleStayActive = useCallback(() => {
    clearTimers();
    isWarningRef.current = false;
    setShowWarning(false);
    setCountdown(WARNING_SECONDS);
    // Reinicia el timer de inactividad
    idleTimerRef.current = setTimeout(() => {
      startCountdown();
    }, IDLE_MINUTES * 60 * 1000);
  }, [startCountdown]);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Arranca el timer inicial
    resetIdleTimer();

    // Escucha actividad del usuario
    const onActivity = () => resetIdleTimer();
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, onActivity, { passive: true }));

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, onActivity));
    };
  }, [isAuthenticated, resetIdleTimer]);

  return { showWarning, countdown, handleStayActive };
}