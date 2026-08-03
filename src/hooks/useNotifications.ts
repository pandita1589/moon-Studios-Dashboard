// src/hooks/useNotifications.ts

import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { playNotificationSound } from '@/lib/notificationSound';
import type { SoundType } from '@/lib/notificationSound';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type NotifCategory = 'announcement' | 'email' | 'thread' | 'message';

export interface UnifiedNotification {
  id:        string;
  category:  NotifCategory;
  title:     string;
  preview:   string;
  createdAt: Date;
  important?: boolean;
  linkTo?:   string;
  rawId?:    string;
}

interface UseNotificationsOptions {
  uid:               string | undefined;
  soundType:         SoundType;
  soundVolume:       number;
  muted:             boolean;
  enabledCategories: Record<NotifCategory, boolean>;
}

// ── Storage helpers — CLAVE POR USUARIO para evitar que estados de sesiones
//    anteriores contaminen nuevas sesiones o usuarios distintos ───────────────

function storageKey(uid: string) {
  return `notif_readIds_v3_${uid}`;
}

function loadReadIds(uid: string | undefined): Set<string> {
  if (!uid) return new Set();
  try {
    const raw = localStorage.getItem(storageKey(uid));
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveReadIds(uid: string | undefined, ids: Set<string>) {
  if (!uid) return;
  try {
    localStorage.setItem(storageKey(uid), JSON.stringify([...ids]));
  } catch {}
}

// Limpia claves de versiones antiguas para no acumular basura
function cleanLegacyKeys() {
  try {
    const legacyPrefixes = ['notif_readIds_v1', 'notif_readIds_v2'];
    Object.keys(localStorage).forEach(k => {
      if (legacyPrefixes.some(p => k.startsWith(p))) {
        localStorage.removeItem(k);
      }
    });
  } catch {}
}

// ── Hook principal ─────────────────────────────────────────────────────────────

export function useNotifications({
  uid,
  soundType,
  soundVolume,
  muted,
  enabledCategories,
}: UseNotificationsOptions) {

  const [notifications, setNotifications] = useState<UnifiedNotification[]>([]);

  // FIX: readIds empieza vacío — se carga cuando uid está disponible
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const knownIdsRef    = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);
  const prevUidRef     = useRef<string | undefined>(undefined);

  // ── FIX PRINCIPAL: Cargar readIds del usuario correcto cuando uid cambia ──
  // Esto soluciona el bug de "siempre aparece como no leído al iniciar sesión"
  useEffect(() => {
    if (!uid) {
      // Sin sesión: limpiar todo
      setReadIds(new Set());
      setNotifications([]);
      knownIdsRef.current    = new Set();
      isFirstLoadRef.current = true;
      prevUidRef.current     = undefined;
      return;
    }

    // Si cambió el usuario (logout + login con otro), resetear estado
    if (prevUidRef.current && prevUidRef.current !== uid) {
      knownIdsRef.current    = new Set();
      isFirstLoadRef.current = true;
      setNotifications([]);
    }

    prevUidRef.current = uid;

    // Cargar IDs leídos del localStorage para este usuario
    const stored = loadReadIds(uid);
    setReadIds(stored);

    // Limpiar claves obsoletas una sola vez
    cleanLegacyKeys();
  }, [uid]);

  // ── Merge helper ──────────────────────────────────────────────────────────
  const merge = useCallback((incoming: UnifiedNotification[], category: NotifCategory) => {
    setNotifications(prev => {
      const rest     = prev.filter(n => n.category !== category);
      const combined = [...rest, ...incoming];
      combined.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return combined.slice(0, 50);
    });
  }, []);

  // ── Sonido: solo para notificaciones genuinamente nuevas ──────────────────
  useEffect(() => {
    if (notifications.length === 0) return;

    if (isFirstLoadRef.current) {
      // Primera carga post-login: registrar todos sin sonar
      notifications.forEach(n => knownIdsRef.current.add(n.id));
      isFirstLoadRef.current = false;
      return;
    }

    const newOnes = notifications.filter(n => !knownIdsRef.current.has(n.id));
    if (newOnes.length > 0) {
      newOnes.forEach(n => knownIdsRef.current.add(n.id));
      if (!muted) {
        playNotificationSound(soundType, soundVolume);
      }
    }
  }, [notifications]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Listener: Anuncios ────────────────────────────────────────────────────
  useEffect(() => {
    if (!uid || !enabledCategories.announcement) {
      merge([], 'announcement');
      return;
    }

    const q = query(
      collection(db, 'announcements'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsub = onSnapshot(q, snap => {
      const items: UnifiedNotification[] = snap.docs.map(doc => {
        const d = doc.data();
        return {
          id:        `ann_${doc.id}`,
          rawId:     doc.id,
          category:  'announcement',
          title:     d.title   ?? 'Anuncio',
          preview:   d.content ?? '',
          createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(d.createdAt || 0),
          important: d.important ?? false,
          linkTo:    '/dashboard/announcements',
        };
      });
      merge(items, 'announcement');
    }, err => console.error('[notif] announcements:', err));
    return unsub;
  }, [uid, enabledCategories.announcement, merge]);

  // ── Listener: Correos ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!uid || !enabledCategories.email) {
      merge([], 'email');
      return;
    }

    const q = query(
      collection(db, 'correos'),
      where('toUid',   '==', uid),
      where('read',    '==', false),
      where('deleted', '==', false),
      where('draft',   '==', false)
    );
    const unsub = onSnapshot(q, snap => {
      const items: UnifiedNotification[] = snap.docs
        .map(doc => {
          const d = doc.data();
          return {
            id:        `mail_${doc.id}`,
            rawId:     doc.id,
            category:  'email' as NotifCategory,
            title:     d.subject  ?? '(Sin asunto)',
            preview:   `De: ${d.fromName ?? d.fromEmail ?? 'Desconocido'}`,
            createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(d.createdAt || 0),
            linkTo:    '/dashboard/correo',
          };
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      merge(items, 'email');
    }, err => console.error('[notif] correos:', err));
    return unsub;
  }, [uid, enabledCategories.email, merge]);

  // ── Listener: Hilos ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!uid || !enabledCategories.thread) {
      merge([], 'thread');
      return;
    }

    const q = query(
      collection(db, 'hilos'),
      where('participants', 'array-contains', uid)
    );
    const unsub = onSnapshot(q, snap => {
      const items: UnifiedNotification[] = snap.docs
        .map(doc => {
          const d  = doc.data();
          const ts = d.updatedAt?.toDate
            ? d.updatedAt.toDate()
            : d.createdAt?.toDate
              ? d.createdAt.toDate()
              : new Date(0);
          return {
            id:        `hilo_${doc.id}`,
            rawId:     doc.id,
            category:  'thread' as NotifCategory,
            title:     d.title       ?? 'Nuevo hilo',
            preview:   d.lastMessage ?? d.description ?? '',
            createdAt: ts,
            linkTo:    '/dashboard/hilos',
          };
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 15);
      merge(items, 'thread');
    }, err => console.error('[notif] hilos:', err));
    return unsub;
  }, [uid, enabledCategories.thread, merge]);

  // ── Listener: Mensajería ──────────────────────────────────────────────────
  useEffect(() => {
    if (!uid || !enabledCategories.message) {
      merge([], 'message');
      return;
    }

    const q = query(
      collection(db, 'mensajeria'),
      where('toUid', '==', uid),
      where('read',  '==', false)
    );
    const unsub = onSnapshot(q, snap => {
      const items: UnifiedNotification[] = snap.docs
        .map(doc => {
          const d = doc.data();
          return {
            id:        `msg_${doc.id}`,
            rawId:     doc.id,
            category:  'message' as NotifCategory,
            title:     `Mensaje de ${d.fromName ?? 'alguien'}`,
            preview:   d.text ?? d.content ?? '',
            createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(d.createdAt || 0),
            linkTo:    '/dashboard/mensajeria',
          };
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 15);
      merge(items, 'message');
    }, err => console.error('[notif] mensajeria:', err));
    return unsub;
  }, [uid, enabledCategories.message, merge]);

  // ── Acciones ──────────────────────────────────────────────────────────────

  const unreadCount = notifications.filter(n => !readIds.has(n.id)).length;

  const markOneRead = useCallback((id: string) => {
    setReadIds(prev => {
      const next = new Set(prev);
      next.add(id);
      saveReadIds(uid, next);
      return next;
    });
  }, [uid]);

  const markAllRead = useCallback(() => {
    const all = new Set(notifications.map(n => n.id));
    setReadIds(all);
    saveReadIds(uid, all);
  }, [notifications, uid]);

  // markPanelSeen se mantiene como no-op — el DashboardLayout
  // llama markAllRead con delay al abrir el panel
  const markPanelSeen = useCallback(() => {}, []);

  return { notifications, unreadCount, readIds, markOneRead, markAllRead, markPanelSeen };
}