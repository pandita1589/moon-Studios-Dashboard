// src/hooks/useTabSync.ts
//
// Detecta cuando el mismo usuario abre otra pestaña con el dashboard.
// Usa BroadcastChannel (soportado en todos los navegadores modernos).
//
// Protocolo:
//   1. Al montar, esta pestaña anuncia su existencia → "TAB_HELLO"
//   2. Cualquier pestaña que ya existía responde → "TAB_ACK"
//   3. La pestaña nueva recibe el ACK y muestra el modal
//   4. El usuario elige: quedarse aquí (manda "TAB_TAKEOVER") o ir a la otra
//   5. La pestaña que recibe "TAB_TAKEOVER" cierra su sesión local (no Firebase)

import { useEffect, useState, useCallback, useRef } from 'react';

const CHANNEL_NAME = 'moon_tab_sync';

export type TabChoice = 'stay' | 'switch' | null;

interface UseTabSyncResult {
  showModal:       boolean;
  handleStayHere:  () => void;
  handleGoToOther: () => void;
}

export function useTabSync(isAuthenticated: boolean): UseTabSyncResult {
  const [showModal, setShowModal] = useState(false);
  const channelRef  = useRef<BroadcastChannel | null>(null);
  const tabIdRef    = useRef<string>(Math.random().toString(36).slice(2));
  const ackReceivedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!('BroadcastChannel' in window)) return;

    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;
    const myId = tabIdRef.current;

    const handler = (e: MessageEvent) => {
      const { type, from } = e.data ?? {};
      if (from === myId) return; // ignorar mis propios mensajes

      if (type === 'TAB_HELLO') {
        // Otra pestaña acaba de abrir — le respondo que ya existía
        channel.postMessage({ type: 'TAB_ACK', from: myId });
      }

      if (type === 'TAB_ACK' && !ackReceivedRef.current) {
        // Soy la pestaña nueva y recibí un ACK de una pestaña existente
        ackReceivedRef.current = true;
        setShowModal(true);
      }

      if (type === 'TAB_TAKEOVER') {
        // La pestaña nueva tomó el control — esta pestaña debe "retirarse"
        // No hacemos logout en Firebase, solo cerramos el modal si estuviera
        // abierto y bloqueamos la UI brevemente
        setShowModal(false);
        // Pequeño efecto visual de "esta pestaña fue desplazada"
        document.title = '— Sesión tomada en otra pestaña';
        // Redirige a una pantalla de "sesión activa en otro lugar"
        window.location.href = '/?displaced=1';
      }
    };

    channel.addEventListener('message', handler);

    // Anuncio mi llegada con un pequeño delay para asegurar que el canal esté listo
    const timeout = setTimeout(() => {
      channel.postMessage({ type: 'TAB_HELLO', from: myId });
    }, 200);

    return () => {
      clearTimeout(timeout);
      channel.removeEventListener('message', handler);
      channel.close();
    };
  }, [isAuthenticated]);

  const handleStayHere = useCallback(() => {
    // Esta pestaña toma el control — le avisa a las otras que se retiren
    channelRef.current?.postMessage({ type: 'TAB_TAKEOVER', from: tabIdRef.current });
    setShowModal(false);
  }, []);

  const handleGoToOther = useCallback(() => {
    // El usuario prefiere la otra pestaña — cierra esta
    setShowModal(false);
    window.close();
    // Si window.close() no funciona (Chrome bloquea si no fue abierta por script),
    // redirige a la raíz con un mensaje
    setTimeout(() => { window.location.href = '/?closed=1'; }, 300);
  }, []);

  return { showModal, handleStayHere, handleGoToOther };
}