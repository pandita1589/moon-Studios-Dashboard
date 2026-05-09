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

// ── Storage helpers ────────────────────────────────────────────────────────────

const STORAGE_KEY_READ = 'notif_readIds_v2';

function loadReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_READ);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function saveReadIds(ids: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY_READ, JSON.stringify([...ids])); } catch {}
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
  const [readIds, setReadIds] = useState<Set<string>>(loadReadIds);

  // IDs que ya conocíamos al cargar la página — para no sonar en el primer render
  const knownIdsRef    = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);

  // ── Merge helper: reemplaza la categoría y reordena ───────────────────────
  const merge = useCallback((incoming: UnifiedNotification[], category: NotifCategory) => {
    setNotifications(prev => {
      const rest     = prev.filter(n => n.category !== category);
      const combined = [...rest, ...incoming];
      combined.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return combined.slice(0, 50);
    });
  }, []);

  // ── Sonido: reacciona solo a IDs genuinamente nuevos ──────────────────────
  // Separado del merge para no depender de readIds (que cambia al marcar leído)
  useEffect(() => {
    if (notifications.length === 0) return;

    if (isFirstLoadRef.current) {
      // Primera carga: registra silenciosamente todos los IDs actuales
      notifications.forEach(n => knownIdsRef.current.add(n.id));
      isFirstLoadRef.current = false;
      return;
    }

    // Detecta IDs que no existían antes
    const newOnes = notifications.filter(n => !knownIdsRef.current.has(n.id));
    if (newOnes.length > 0) {
      newOnes.forEach(n => knownIdsRef.current.add(n.id));
      if (!muted) {
        playNotificationSound(soundType, soundVolume);
      }
    }
  }, [notifications]); // Solo depende de notifications — intencional

  // ── Listener: Anuncios ────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabledCategories.announcement) { merge([], 'announcement'); return; }

    // Anuncios: orderBy es seguro porque es una sola colección sin where-uid
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
  }, [enabledCategories.announcement, merge]);

  // ── Listener: Correos no leídos ───────────────────────────────────────────
  useEffect(() => {
    if (!uid || !enabledCategories.email) { merge([], 'email'); return; }

    // SIN orderBy para evitar requerir índice compuesto — ordenamos en cliente
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
    if (!uid || !enabledCategories.thread) { merge([], 'thread'); return; }

    // Ajusta 'participants' al nombre real del campo en tu colección 'hilos'
    const q = query(
      collection(db, 'hilos'),
      where('participants', 'array-contains', uid)
    );
    const unsub = onSnapshot(q, snap => {
      const items: UnifiedNotification[] = snap.docs
        .map(doc => {
          const d  = doc.data();
          const ts: Date = d.updatedAt?.toDate
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
    if (!uid || !enabledCategories.message) { merge([], 'message'); return; }

    // Ajusta 'toUid' y 'read' al nombre real de tu colección 'mensajeria'
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
      saveReadIds(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    const all = new Set(notifications.map(n => n.id));
    setReadIds(all);
    saveReadIds(all);
  }, [notifications]);

  const markPanelSeen = useCallback(() => {}, []);

  return { notifications, unreadCount, readIds, markOneRead, markAllRead, markPanelSeen };
}