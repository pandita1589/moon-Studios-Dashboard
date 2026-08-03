// src/lib/notificationSound.ts

export type SoundType = 'none' | 'soft' | 'default' | 'ping' | 'chime';

// Reutilizamos un solo AudioContext para cumplir con la política de autoplay
let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!sharedCtx || sharedCtx.state === 'closed') {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      sharedCtx = new AC();
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

// Llamar esto en cualquier click del usuario para desbloquear el AudioContext
export function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

export async function playNotificationSound(type: SoundType, volume = 1.0): Promise<void> {
  if (type === 'none') return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Intenta reanudar si está suspendido (política de autoplay)
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    // Si sigue suspendido, no hay nada que hacer — el navegador lo bloqueó
    if (ctx.state !== 'running') return;

    const masterGain = ctx.createGain();
    masterGain.gain.value = Math.min(1, Math.max(0, volume));
    masterGain.connect(ctx.destination);

    const t = ctx.currentTime;

    const play = (
      freq:      number,
      startTime: number,
      duration:  number,
      startVol:  number,
      oscType:   OscillatorType = 'sine'
    ) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type            = oscType;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(startVol, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    switch (type) {
      case 'soft':
        play(440, t,        0.25, 0.06);
        play(440, t + 0.28, 0.20, 0.04);
        break;

      case 'default':
        play(523.25, t,        0.15, 0.12);
        play(659.25, t + 0.18, 0.25, 0.12);
        break;

      case 'ping':
        play(880, t, 0.45, 0.15);
        break;

      case 'chime':
        play(523.25, t,        0.55, 0.12);
        play(659.25, t + 0.12, 0.55, 0.10);
        play(783.99, t + 0.24, 0.65, 0.09);
        break;
    }
  } catch (err) {
    console.warn('[notif sound] error:', err);
  }
}

export const previewSound = (type: SoundType) => playNotificationSound(type, 0.7);