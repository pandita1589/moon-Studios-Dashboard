import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { supabase } from '@/lib/supabaseclient';
import {
  collection, addDoc, updateDoc, doc,
  onSnapshot, query, orderBy, where, Timestamp,
  increment, getDoc, writeBatch, limit, startAfter,
  DocumentSnapshot, getDocs, deleteField, setDoc
} from 'firebase/firestore';
import { motion, AnimatePresence, useScroll, useSpring } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  GitBranch, Plus, Search, Paperclip, X, Send,
  File, Download, Eye, Trash2, Pin,
  Lock, Unlock, MessageSquare, RefreshCw,
  Hash, Smile, ArrowLeft, MoreHorizontal,
  AlertCircle, BookOpen, Palette, Code, Megaphone,
  Bell, BellOff, Share2, Edit3, Check, Copy,
  Filter, ExternalLink, Archive, Sparkles,
  ChevronDown, QrCode, ArchiveRestore, FileText,
  Image as ImageIcon, Menu
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';

/* ═══════════════════════════════
   TIPOS
═══════════════════════════════ */
interface Attachment {
  id: string; url: string; name: string; type: string;
  size: number; thumbnailUrl?: string;
}
interface Reply {
  id: string; hiloId: string; authorUid: string; authorName: string;
  authorAvatar?: string; authorRole: string; body: string;
  attachments: Attachment[]; reactions: Record<string, string[]>;
  createdAt: any; edited?: boolean; editedAt?: any;
  parentId?: string | null; mentions?: string[];
}
interface Hilo {
  id: string; title: string; body: string; authorUid: string;
  authorName: string; authorAvatar?: string; authorRole: string;
  category: string; tags: string[]; attachments: Attachment[];
  createdAt: any; updatedAt: any; pinned: boolean; locked: boolean;
  deleted: boolean; archived: boolean; replyCount: number;
  viewCount: number; reactions: Record<string, string[]>;
  subscribers: string[]; lastReplyAt?: any; isAnnouncement?: boolean;
  edited?: boolean; editedAt?: any;
}
interface UserPresence {
  uid: string; displayName: string; avatar?: string;
  lastSeen: any; isOnline: boolean;
}

/* ═══════════════════════════════
   CONSTANTES
═══════════════════════════════ */
const HILOS_BUCKET = 'hilos';
const REPLIES_PER_PAGE = 20;
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const CATEGORIES = [
  { id: 'general',    label: 'General',    icon: Hash,        color: 'text-zinc-400',   bg: 'bg-zinc-400/10' },
  { id: 'anuncios',   label: 'Anuncios',   icon: Megaphone,   color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  { id: 'diseno',     label: 'Diseño',     icon: Palette,     color: 'text-pink-500',   bg: 'bg-pink-500/10' },
  { id: 'desarrollo', label: 'Desarrollo', icon: Code,        color: 'text-blue-400',   bg: 'bg-blue-400/10' },
  { id: 'recursos',   label: 'Recursos',   icon: BookOpen,    color: 'text-green-400',  bg: 'bg-green-400/10' },
  { id: 'importante', label: 'Importante', icon: AlertCircle, color: 'text-red-400',    bg: 'bg-red-400/10' },
];

const REACTIONS = ['👍','❤️','😂','😮','🎉','👏','🔥','💡','❓','✅'];
const ADMIN_ROLES = ['CEO','Administración','Moderador'];

/* ═══════════════════════════════
   HELPERS
═══════════════════════════════ */
const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024; const sizes = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};
const formatRelative = (ts: any) => {
  if (!ts) return '';
  try { const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return formatDistanceToNow(d, { addSuffix: true, locale: es }); }
  catch { return ''; }
};
const formatFull = (ts: any) => {
  if (!ts) return '';
  try { const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return format(d, "d 'de' MMM 'a las' HH:mm", { locale: es }); }
  catch { return ''; }
};
const getCategoryInfo = (id: string) => CATEGORIES.find(c => c.id === id) ?? CATEGORIES[0];
const generateId = () => Math.random().toString(36).substr(2, 9);
const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return ImageIcon;
  if (type === 'application/pdf') return FileText;
  return File;
};
const getGoogleViewerUrl = (url: string) =>
  `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;

/* ═══════════════════════════════
   COMPONENTE PRINCIPAL
═══════════════════════════════ */
const HilosComponent: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const uid = currentUser?.uid || '';
  const isAdmin = ADMIN_ROLES.includes(userProfile?.role || '');

  /* ─── State principal ─── */
  const [hilos, setHilos] = useState<Hilo[]>([]);
  const [archivedHilos, setArchivedHilos] = useState<Hilo[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [_loadingArchived, setLoadingArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedHilo, setSelectedHilo] = useState<Hilo | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'updated'|'created'|'popular'>('updated');
  const [filterStatus, setFilterStatus] = useState<'all'|'open'|'closed'>('all');

  /* ─── Mobile UI ─── */
  const [showSidebar, setShowSidebar] = useState(false);

  /* ─── Compose state ─── */
  const [showNewHilo, setShowNewHilo] = useState(false);
  const [editingHilo, setEditingHilo] = useState<Hilo | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newCategory, setNewCategory] = useState('general');
  const [newTags, setNewTags] = useState('');
  const [newAttachments, setNewAttachments] = useState<Attachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isAnnouncement, setIsAnnouncement] = useState(false);

  /* ─── Reply state ─── */
  const [replyBody, setReplyBody] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<Attachment[]>([]);
  const [uploadingReply, setUploadingReply] = useState(false);
  const [submittingReply, setSubmittingReply] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Reply | null>(null);
  const [editingReply, setEditingReply] = useState<Reply | null>(null);

  /* ─── UI State ─── */
  const [viewerFile, setViewerFile] = useState<Attachment | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [hasMoreReplies, setHasMoreReplies] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState<UserPresence[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);

  /* ─── Refs ─── */
  const fileNewRef = useRef<HTMLInputElement>(null);
  const fileReplyRef = useRef<HTMLInputElement>(null);
  const repliesEndRef = useRef<HTMLDivElement>(null);
  const replyTextRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastReplyDocRef = useRef<DocumentSnapshot | null>(null);

  /* ─── Scroll progress ─── */
  const { scrollYProgress } = useScroll({ container: containerRef });
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  /* ═══════════════════════════════
     FIRESTORE — hilos realtime
  ═══════════════════════════════ */
  useEffect(() => {
    let q = query(
      collection(db, 'hilos'),
      where('deleted', '==', false),
      where('archived', '==', false),
      orderBy('pinned', 'desc')
    );
    if (sortBy === 'updated') q = query(q, orderBy('updatedAt', 'desc'));
    else if (sortBy === 'created') q = query(q, orderBy('createdAt', 'desc'));
    else if (sortBy === 'popular') q = query(q, orderBy('viewCount', 'desc'));

    const unsub = onSnapshot(q, snap => {
      setHilos(snap.docs.map(d => ({ id: d.id, ...d.data() } as Hilo)));
      setLoading(false);
    }, error => { console.error('Error hilos:', error); setLoading(false); });
    return () => unsub();
  }, [sortBy]);

  /* ─── FIX: Sync selectedHilo desde hilos activos O archivados ─── */
  useEffect(() => {
    if (!selectedHilo) return;
    const fromActive = hilos.find(h => h.id === selectedHilo.id);
    if (fromActive) { setSelectedHilo(fromActive); return; }
    const fromArchived = archivedHilos.find(h => h.id === selectedHilo.id);
    if (fromArchived) setSelectedHilo(fromArchived);
  }, [hilos, archivedHilos, selectedHilo?.id]);

  /* ═══════════════════════════════
     FIRESTORE — hilos archivados (on demand)
     FIX: query separada para admin y no-admin con índices correctos
  ═══════════════════════════════ */
  useEffect(() => {
    if (!showArchived) return;
    setLoadingArchived(true);

    const q = isAdmin
      ? query(
          collection(db, 'hilos'),
          where('deleted', '==', false),
          where('archived', '==', true),
          orderBy('updatedAt', 'desc')
        )
      : query(
          collection(db, 'hilos'),
          where('deleted', '==', false),
          where('archived', '==', true),
          where('authorUid', '==', uid),
          orderBy('updatedAt', 'desc')
        );

    const unsub = onSnapshot(q, snap => {
      setArchivedHilos(snap.docs.map(d => ({ id: d.id, ...d.data() } as Hilo)));
      setLoadingArchived(false);
    }, error => {
      console.error('Error archived:', error);
      setLoadingArchived(false);
    });
    return () => unsub();
  }, [showArchived, isAdmin, uid]);

  /* ═══════════════════════════════
     FIRESTORE — replies paginados
  ═══════════════════════════════ */
  const loadReplies = useCallback(async (hiloId: string, loadMore = false) => {
    if (!loadMore) {
      setLoadingReplies(true); setReplies([]);
      lastReplyDocRef.current = null; setHasMoreReplies(true);
    } else { setLoadingMore(true); }

    try {
      let q = query(
        collection(db, 'hilos', hiloId, 'replies'),
        orderBy('createdAt', 'asc'),
        limit(REPLIES_PER_PAGE)
      );
      if (loadMore && lastReplyDocRef.current)
        q = query(q, startAfter(lastReplyDocRef.current));

      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Reply));
      if (snap.docs.length < REPLIES_PER_PAGE) setHasMoreReplies(false);
      if (snap.docs.length > 0) lastReplyDocRef.current = snap.docs[snap.docs.length - 1];
      setReplies(prev => loadMore ? [...prev, ...data] : data);
    } catch (error) { console.error('Error loading replies:', error); }
    finally { setLoadingReplies(false); setLoadingMore(false); }
  }, []);

  useEffect(() => {
    if (!selectedHilo) { setReplies([]); return; }
    loadReplies(selectedHilo.id);
  }, [selectedHilo?.id]);

  /* ─── viewCount ─── */
  useEffect(() => {
    if (!selectedHilo) return;
    const viewedKey = `viewed_${selectedHilo.id}`;
    if (!sessionStorage.getItem(viewedKey)) {
      updateDoc(doc(db, 'hilos', selectedHilo.id), { viewCount: increment(1) }).catch(() => {});
      sessionStorage.setItem(viewedKey, 'true');
    }
  }, [selectedHilo?.id]);

  /* ═══════════════════════════════
     PRESENCIA
  ═══════════════════════════════ */
  useEffect(() => {
    if (!selectedHilo) return;
    const presenceRef = collection(db, 'hilos', selectedHilo.id, 'presence');
    const q = query(presenceRef, where('lastSeen', '>', Timestamp.fromDate(new Date(Date.now() - 5 * 60 * 1000))));
    const unsub = onSnapshot(q, snap => {
      setOnlineUsers(snap.docs.map(d => d.data() as UserPresence));
    });
    if (uid) {
      const userPresenceRef = doc(db, 'hilos', selectedHilo.id, 'presence', uid);
      setDoc(userPresenceRef, {
        uid, displayName: userProfile?.displayName || '',
        avatar: userProfile?.avatar || '', lastSeen: Timestamp.now(), isOnline: true
      }, { merge: true }).catch(console.error);
    }
    return () => unsub();
  }, [selectedHilo?.id, uid]);

  /* ═══════════════════════════════
     COMPRESIÓN / THUMBNAIL
  ═══════════════════════════════ */
  const compressImage = useCallback(async (file: File, maxKB = 800): Promise<File | Blob> => {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/') || file.size < maxKB * 1024) { resolve(file); return; }
      const img = new window.Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        const maxDim = 1920;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = (h / w) * maxDim; w = maxDim; }
          else { w = (w / h) * maxDim; h = maxDim; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          if (!blob) { resolve(file); return; }
          resolve(blob.size < file.size ? blob : file);
        }, 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
      img.src = objectUrl;
    });
  }, []);

  const generateThumbnail = useCallback(async (file: File): Promise<string | undefined> => {
    if (!file.type.startsWith('image/')) return undefined;
    return new Promise((resolve) => {
      const img = new window.Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 300; canvas.height = 300;
        const ctx = canvas.getContext('2d');
        const size = Math.min(img.width, img.height);
        const x = (img.width - size) / 2, y = (img.height - size) / 2;
        ctx?.drawImage(img, x, y, size, size, 0, 0, 300, 300);
        URL.revokeObjectURL(objectUrl);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(undefined); };
      img.src = objectUrl;
    });
  }, []);

  /* ═══════════════════════════════
     UPLOAD
  ═══════════════════════════════ */
  const uploadFiles = useCallback(async (
    files: FileList,
    setAtts: React.Dispatch<React.SetStateAction<Attachment[]>>,
    setUploading: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    const oversized = Array.from(files).filter(f => f.size > MAX_FILE_SIZE_BYTES);
    if (oversized.length > 0) {
      alert(`Archivos que superan ${MAX_FILE_SIZE_MB}MB:\n${oversized.map(f => f.name).join('\n')}`);
      return;
    }
    setUploading(true);
    const result: Attachment[] = [];
    for (const file of Array.from(files)) {
      try {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        const compressed = await compressImage(file);
        const compressedSize = (compressed as Blob).size;
        if (compressedSize === 0) continue;
        const attachmentId = generateId();
        const fileType = compressed.type || file.type || 'application/octet-stream';
        const path = `${uid}/${Date.now()}_${attachmentId}_${file.name}`;
        const { error, data } = await supabase.storage
          .from(HILOS_BUCKET).upload(path, compressed, { upsert: true, cacheControl: '3600', contentType: fileType });
        if (error) { alert(`Error al subir "${file.name}": ${error.message}`); continue; }
        if (data) {
          const { data: { publicUrl } } = supabase.storage.from(HILOS_BUCKET).getPublicUrl(path);
          const thumbnail = file.type.startsWith('image/') ? await generateThumbnail(file) : null;
          const attachment: Attachment = { id: attachmentId, url: publicUrl, name: file.name, type: fileType, size: compressedSize };
          if (thumbnail) attachment.thumbnailUrl = thumbnail;
          result.push(attachment);
        }
      } catch (err) { alert(`Error inesperado al subir "${file.name}"`); }
    }
    setAtts(prev => [...prev, ...result]);
    setUploading(false);
  }, [uid, compressImage, generateThumbnail]);

  /* ─── Storage path ─── */
  const getSupabasePath = useCallback((url: string) => {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split(`/${HILOS_BUCKET}/`);
      return parts.length > 1 ? decodeURIComponent(parts[1]) : '';
    } catch { return ''; }
  }, []);

  const deleteAttachments = useCallback(async (attachments: Attachment[]) => {
    if (!attachments?.length) return;
    const paths = attachments.map(a => getSupabasePath(a.url)).filter(Boolean);
    if (paths.length) {
      const { error } = await supabase.storage.from(HILOS_BUCKET).remove(paths);
      if (error) console.error('Error eliminando archivos:', error.message);
    }
  }, [getSupabasePath]);

  /* ═══════════════════════════════
     CRUD HILOS
  ═══════════════════════════════ */
  const handleCreateHilo = useCallback(async () => {
    if (!newTitle.trim() || !newBody.trim()) { alert('Título y contenido son obligatorios'); return; }
    setSubmitting(true);
    try {
      const tags = newTags.split(/[,#]/).map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 5);
      const hiloData = {
        title: newTitle.trim(), body: newBody.trim(),
        authorUid: uid, authorName: userProfile?.displayName || '',
        authorAvatar: userProfile?.avatar || null, authorRole: userProfile?.role || '',
        category: newCategory, tags, attachments: newAttachments,
        createdAt: Timestamp.now(), updatedAt: Timestamp.now(), lastReplyAt: Timestamp.now(),
        pinned: false, locked: false, deleted: false, archived: false,
        replyCount: 0, viewCount: 0, reactions: {}, subscribers: [uid],
        isAnnouncement: isAnnouncement && isAdmin
      };
      const docRef = await addDoc(collection(db, 'hilos'), hiloData);
      await addDoc(collection(db, 'notifications'), {
        type: 'new_hilo', hiloId: docRef.id, category: newCategory,
        title: newTitle.trim(), authorName: userProfile?.displayName || '',
        createdAt: Timestamp.now(), readBy: []
      });
      resetNewHilo(); setShowNewHilo(false);
      setSelectedHilo({ id: docRef.id, ...hiloData } as Hilo);
    } catch (e) { console.error(e); alert('Error al crear el hilo'); }
    finally { setSubmitting(false); }
  }, [newTitle, newBody, newCategory, newTags, newAttachments, uid, userProfile, isAdmin, isAnnouncement]);

  const handleUpdateHilo = useCallback(async () => {
    if (!editingHilo || !newTitle.trim() || !newBody.trim()) return;
    setSubmitting(true);
    try {
      const tags = newTags.split(/[,#]/).map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 5);
      await updateDoc(doc(db, 'hilos', editingHilo.id), {
        title: newTitle.trim(), body: newBody.trim(), category: newCategory,
        tags, attachments: newAttachments, updatedAt: Timestamp.now(),
        edited: true, editedAt: Timestamp.now()
      });
      setEditingHilo(null); resetNewHilo(); setShowNewHilo(false);
    } catch (e) { console.error(e); alert('Error al actualizar el hilo'); }
    finally { setSubmitting(false); }
  }, [editingHilo, newTitle, newBody, newCategory, newTags, newAttachments]);

  const resetNewHilo = useCallback(() => {
    setNewTitle(''); setNewBody(''); setNewCategory('general');
    setNewTags(''); setNewAttachments([]); setIsAnnouncement(false); setEditingHilo(null);
  }, []);

  const startEditHilo = useCallback((hilo: Hilo) => {
    setEditingHilo(hilo); setNewTitle(hilo.title); setNewBody(hilo.body);
    setNewCategory(hilo.category); setNewTags(hilo.tags.join(', '));
    setNewAttachments(hilo.attachments); setIsAnnouncement(hilo.isAnnouncement || false);
    setShowNewHilo(true);
  }, []);

  /* ═══════════════════════════════
     CRUD REPLIES
  ═══════════════════════════════ */
  const handleReply = useCallback(async () => {
    if (!selectedHilo || !replyBody.trim()) return;
    if (selectedHilo.locked && !isAdmin) { alert('Este hilo está cerrado'); return; }
    setSubmittingReply(true);
    try {
      const mentions = replyBody.match(/@(\w+)/g)?.map(m => m.slice(1)) || [];
      const replyData = {
        hiloId: selectedHilo.id, authorUid: uid,
        authorName: userProfile?.displayName || '',
        authorAvatar: userProfile?.avatar || null, authorRole: userProfile?.role || '',
        body: replyBody.trim(), attachments: replyAttachments,
        reactions: {}, createdAt: Timestamp.now(), edited: false,
        parentId: replyingTo?.id || null, mentions
      };
      const batch = writeBatch(db);
      const replyRef = doc(collection(db, 'hilos', selectedHilo.id, 'replies'));
      batch.set(replyRef, replyData);
      batch.update(doc(db, 'hilos', selectedHilo.id), {
        replyCount: increment(1), updatedAt: Timestamp.now(), lastReplyAt: Timestamp.now()
      });
      await batch.commit();
      if (mentions.length > 0) {
        await addDoc(collection(db, 'notifications'), {
          type: 'mention', hiloId: selectedHilo.id, replyId: replyRef.id,
          mentionedUsers: mentions, authorName: userProfile?.displayName || '',
          createdAt: Timestamp.now(), readBy: []
        });
      }
      setReplyBody(''); setReplyAttachments([]); setReplyingTo(null);
    } catch (e) { console.error(e); alert('Error al responder'); }
    finally { setSubmittingReply(false); }
  }, [selectedHilo, replyBody, replyAttachments, uid, userProfile, isAdmin, replyingTo]);

  const handleUpdateReply = useCallback(async () => {
    if (!selectedHilo || !editingReply || !replyBody.trim()) return;
    try {
      await updateDoc(doc(db, 'hilos', selectedHilo.id, 'replies', editingReply.id), {
        body: replyBody.trim(), attachments: replyAttachments,
        edited: true, editedAt: Timestamp.now()
      });
      setEditingReply(null); setReplyBody(''); setReplyAttachments([]);
    } catch (e) { console.error(e); alert('Error al editar respuesta'); }
  }, [selectedHilo, editingReply, replyBody, replyAttachments]);

  const startEditReply = useCallback((reply: Reply) => {
    setEditingReply(reply); setReplyBody(reply.body);
    setReplyAttachments(reply.attachments); replyTextRef.current?.focus();
  }, []);

  /* ─── Reacciones ─── */
  const toggleReaction = useCallback(async (targetId: string, emoji: string, isReply: boolean) => {
    if (!selectedHilo) return;
    const ref = isReply
      ? doc(db, 'hilos', selectedHilo.id, 'replies', targetId)
      : doc(db, 'hilos', targetId);
    try {
      const docSnap = await getDoc(ref);
      if (!docSnap.exists()) return;
      const current = docSnap.data().reactions?.[emoji] || [];
      const hasReacted = current.includes(uid);
      const updated = hasReacted ? current.filter((u: string) => u !== uid) : [...current, uid];
      await updateDoc(ref, {
        [`reactions.${emoji}`]: updated.length > 0 ? updated : deleteField()
      });
    } catch (error) { console.error('Reaction error:', error); }
  }, [selectedHilo, uid]);

  /* ─── Acciones admin ─── */
  const togglePin = useCallback(async (hilo: Hilo) => {
    const updateData: Record<string, any> = { pinned: !hilo.pinned };
    if (!hilo.pinned) updateData.pinnedAt = Timestamp.now();
    else updateData.pinnedAt = deleteField();
    await updateDoc(doc(db, 'hilos', hilo.id), updateData);
  }, []);

  const toggleLock = useCallback(async (hilo: Hilo) => {
    await updateDoc(doc(db, 'hilos', hilo.id), { locked: !hilo.locked });
  }, []);

  const archiveHilo = useCallback(async (hilo: Hilo) => {
    if (!confirm('¿Archivar este hilo? Podrás recuperarlo después.')) return;
    await updateDoc(doc(db, 'hilos', hilo.id), { archived: true, archivedAt: Timestamp.now() });
    setSelectedHilo(null);
  }, []);

  const unarchiveHilo = useCallback(async (hilo: Hilo) => {
    await updateDoc(doc(db, 'hilos', hilo.id), { archived: false, archivedAt: deleteField() });
    setSelectedHilo(null);
  }, []);

  const deleteHilo = useCallback(async (hilo: Hilo) => {
    if (!confirm(`¿Eliminar permanentemente "${hilo.title}"?`)) return;
    try {
      await deleteAttachments(hilo.attachments);
      const repliesSnap = await getDocs(collection(db, 'hilos', hilo.id, 'replies'));
      const allReplyAtts = repliesSnap.docs.flatMap(d => (d.data().attachments || []) as Attachment[]);
      if (allReplyAtts.length > 0) await deleteAttachments(allReplyAtts);
      const batch = writeBatch(db);
      repliesSnap.docs.forEach(d => batch.delete(d.ref));
      batch.delete(doc(db, 'hilos', hilo.id));
      await batch.commit();
      setSelectedHilo(null);
    } catch (error) { console.error(error); alert('Error al eliminar el hilo'); }
  }, [deleteAttachments]);

  const deleteReply = useCallback(async (reply: Reply) => {
    if (!selectedHilo || !confirm('¿Eliminar esta respuesta?')) return;
    try {
      await deleteAttachments(reply.attachments);
      const batch = writeBatch(db);
      batch.delete(doc(db, 'hilos', selectedHilo.id, 'replies', reply.id));
      batch.update(doc(db, 'hilos', selectedHilo.id), { replyCount: increment(-1) });
      await batch.commit();
      setReplies(prev => prev.filter(r => r.id !== reply.id));
    } catch (error) { console.error(error); alert('Error al eliminar la respuesta'); }
  }, [selectedHilo, deleteAttachments]);

  const toggleSubscription = useCallback(async (hilo: Hilo) => {
    const isSubscribed = hilo.subscribers?.includes(uid);
    const newSubs = isSubscribed
      ? hilo.subscribers.filter(s => s !== uid)
      : [...(hilo.subscribers || []), uid];
    await updateDoc(doc(db, 'hilos', hilo.id), { subscribers: newSubs });
  }, [uid]);

  /* ─── Utilities ─── */
  const handleDownload = useCallback(async (att: Attachment) => {
    try {
      const res = await fetch(att.url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = att.name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { window.open(att.url, '_blank'); }
  }, []);

  const getShareUrl = useCallback((hiloId: string) =>
    `${window.location.origin}/hilos/observe/${hiloId}`, []);

  const copyLink = useCallback((hiloId: string) => {
    navigator.clipboard.writeText(getShareUrl(hiloId));
    setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000);
  }, [getShareUrl]);

  const shareHilo = useCallback(async (hilo: Hilo) => {
    const url = getShareUrl(hilo.id);
    if (navigator.share) {
      try { await navigator.share({ title: hilo.title, text: hilo.body.slice(0, 100) + '...', url }); return; }
      catch { /* fallback */ }
    }
    setShowShareModal(true);
  }, [getShareUrl]);

  /* ─── Filtros ─── */
  const filteredHilos = useMemo(() => {
    const list = showArchived ? archivedHilos : hilos;
    return list.filter(h => {
      const matchCat = showArchived || activeCategory === 'all' || h.category === activeCategory;
      const matchSearch = !searchQuery || (
        h.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        h.body.toLowerCase().includes(searchQuery.toLowerCase()) ||
        h.authorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        h.tags.some(t => t.includes(searchQuery.toLowerCase()))
      );
      const matchStatus = filterStatus === 'all' ||
        (filterStatus === 'open' ? !h.locked : h.locked);
      return matchCat && matchSearch && matchStatus;
    });
  }, [hilos, archivedHilos, showArchived, activeCategory, searchQuery, filterStatus]);

  /* ═══════════════════════════════
     SUB-COMPONENTES
  ═══════════════════════════════ */
  const AttachmentGrid = useCallback(({ attachments, onRemove }: {
    attachments: Attachment[];
    onRemove?: (i: number) => void;
  }) => {
    if (!attachments?.length) return null;
    return (
      <div className={`grid gap-2 mt-3 ${
        attachments.length === 1 ? 'grid-cols-1 max-w-md' :
        attachments.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'
      }`}>
        {attachments.map((att, i) => (
          <motion.div key={att.id || i}
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900 group relative"
          >
            {att.type.startsWith('image/') ? (
              <div className="relative aspect-video cursor-pointer" onClick={() => setViewerFile(att)}>
                <img src={att.thumbnailUrl || att.url} alt={att.name}
                  className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" loading="lazy" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                  <Eye className="w-6 h-6 text-white" />
                </div>
                {onRemove && (
                  <button onClick={(e) => { e.stopPropagation(); onRemove(i); }}
                    className="absolute top-2 right-2 p-1 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 p-2.5">
                <div className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center flex-shrink-0">
                  {(() => { const I = getFileIcon(att.type); return <I className="w-4 h-4 text-zinc-400" />; })()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-zinc-200 text-xs font-medium truncate">{att.name}</p>
                  <p className="text-zinc-600 text-xs">{formatSize(att.size)}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setViewerFile(att)}
                    className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded transition-colors">
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDownload(att)}
                    className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded transition-colors">
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  {onRemove && (
                    <button onClick={() => onRemove(i)}
                      className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    );
  }, [handleDownload]);

  const ReactionBar = useCallback(({ reactions, targetId, isReply }: {
    reactions: Record<string, string[]>;
    targetId: string;
    isReply: boolean;
  }) => {
    const totalReactions = Object.values(reactions || {}).reduce((a, b) => a + b.length, 0);
    const isOpen = showEmojiPicker === targetId;
    return (
      <div className="flex items-center gap-1.5 flex-wrap mt-2">
        {REACTIONS.filter(e => reactions?.[e]?.length > 0).map(emoji => (
          <motion.button key={emoji} whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
            onClick={() => toggleReaction(targetId, emoji, isReply)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all border ${
              reactions[emoji]?.includes(uid)
                ? 'bg-zinc-700 border-zinc-500 text-white'
                : 'border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-900'
            }`}>
            <span>{emoji}</span>
            <span className="font-medium tabular-nums">{reactions[emoji].length}</span>
          </motion.button>
        ))}
        <div className="relative" style={{ isolation: 'isolate' }}>
          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            onClick={() => setShowEmojiPicker(isOpen ? null : targetId)}
            className={`w-6 h-6 flex items-center justify-center rounded-full border transition-all ${
              isOpen ? 'border-zinc-500 bg-zinc-800 text-zinc-300'
                     : 'border-zinc-800 text-zinc-600 hover:border-zinc-600 hover:text-zinc-300'
            }`}>
            <Smile className="w-3.5 h-3.5" />
          </motion.button>
          <AnimatePresence>
            {isOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(null)} />
                <motion.div
                  initial={{ opacity: 0, scale: 0.85, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.85, y: 6 }}
                  transition={{ duration: 0.12 }}
                  className="absolute bottom-full left-0 mb-2 z-50 bg-zinc-900 border border-zinc-700 rounded-xl p-2 shadow-2xl shadow-black/60"
                  style={{ minWidth: '164px' }}
                >
                  <div className="grid grid-cols-5 gap-1">
                    {REACTIONS.map(emoji => (
                      <button key={emoji}
                        onClick={() => { toggleReaction(targetId, emoji, isReply); setShowEmojiPicker(null); }}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg text-base transition-all hover:scale-110 active:scale-95 ${
                          reactions?.[emoji]?.includes(uid) ? 'bg-zinc-700 ring-1 ring-zinc-500' : 'hover:bg-zinc-800'
                        }`}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
        {totalReactions > 0 && (
          <span className="text-zinc-600 text-xs">
            {totalReactions} {totalReactions === 1 ? 'reacción' : 'reacciones'}
          </span>
        )}
      </div>
    );
  }, [uid, toggleReaction, showEmojiPicker]);

  const Avatar = useCallback(({ src, name, size = 'md', isOnline }: {
    src?: string; name: string; size?: 'sm'|'md'|'lg'|'xl'; isOnline?: boolean;
  }) => {
    const sizes = { sm: 'w-6 h-6 text-xs', md: 'w-8 h-8 text-sm', lg: 'w-10 h-10 text-base', xl: 'w-12 h-12 text-lg' };
    return (
      <div className="relative flex-shrink-0">
        <div className={`${sizes[size]} rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center overflow-hidden ring-2 ring-zinc-900`}>
          {src ? <img src={src} className="w-full h-full object-cover" alt={name} loading="lazy" />
               : <span className="text-white font-medium">{name?.[0]?.toUpperCase()}</span>}
        </div>
        {isOnline && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-zinc-900 rounded-full" />}
      </div>
    );
  }, []);

  const MentionSuggestions = useCallback(() => {
    if (!showMentions) return null;
    const suggestions = onlineUsers.filter(u => u.displayName.toLowerCase().includes(mentionQuery.toLowerCase()));
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="absolute bottom-full left-0 mb-2 bg-zinc-900 border border-zinc-800 rounded-xl p-2 min-w-[200px] shadow-2xl z-30">
        {suggestions.map(user => (
          <button key={user.uid}
            onClick={() => {
              const before = replyBody.slice(0, cursorPosition);
              const after = replyBody.slice(cursorPosition);
              setReplyBody(before + user.displayName + ' ' + after);
              setShowMentions(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-800 transition-colors text-left">
            <Avatar src={user.avatar} name={user.displayName} size="sm" isOnline={user.isOnline} />
            <span className="text-zinc-300 text-sm">{user.displayName}</span>
          </button>
        ))}
      </motion.div>
    );
  }, [showMentions, mentionQuery, onlineUsers, cursorPosition, replyBody]);

  /* ─── Sidebar content (reutilizable) ─── */
  const SidebarContent = useCallback(() => (
  <div className="flex flex-col h-full overflow-hidden">
    {/* Botón nuevo hilo */}
    <div className="p-3 border-b border-zinc-800 flex-shrink-0">
      <Button onClick={() => { setShowNewHilo(true); setShowSidebar(false); }}
        className="w-full bg-white text-black hover:bg-zinc-200 font-medium gap-2 text-sm">
        <Plus className="w-4 h-4" /> Nuevo hilo
      </Button>
    </div>

    {/* Nav + Stats juntos, scrolleables */}
    <div className="flex-1 overflow-y-auto">
      <nav className="py-2 px-2 space-y-0.5">
        <button
          onClick={() => { setActiveCategory('all'); setShowArchived(false); setShowSidebar(false); }}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            !showArchived && activeCategory === 'all'
              ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
          }`}>
          <GitBranch className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
          <span className="flex-1 text-left">Todos los hilos</span>
          <span className="text-zinc-600 text-xs bg-zinc-900 px-1.5 py-0.5 rounded-full">{hilos.length}</span>
        </button>

        {CATEGORIES.map(cat => {
          const count = hilos.filter(h => h.category === cat.id).length;
          const isActive = !showArchived && activeCategory === cat.id;
          return (
            <button key={cat.id}
              onClick={() => { setActiveCategory(cat.id); setShowArchived(false); setShowSidebar(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
              }`}>
              <cat.icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : cat.color}`} strokeWidth={1.5} />
              <span className="flex-1 text-left">{cat.label}</span>
              {count > 0 && <span className="text-zinc-600 text-xs bg-zinc-900 px-1.5 py-0.5 rounded-full">{count}</span>}
            </button>
          );
        })}

        <div className="border-t border-zinc-800 my-1.5" />

        <button
          onClick={() => { setShowArchived(true); setSelectedHilo(null); setShowSidebar(false); }}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            showArchived ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
          }`}>
          <Archive className={`w-4 h-4 flex-shrink-0 ${showArchived ? 'text-white' : 'text-zinc-500'}`} strokeWidth={1.5} />
          <span className="flex-1 text-left">Archivados</span>
          {archivedHilos.length > 0 && (
            <span className="text-zinc-600 text-xs bg-zinc-900 px-1.5 py-0.5 rounded-full">{archivedHilos.length}</span>
          )}
        </button>
      </nav>

      {/* Estadísticas — justo debajo del nav, sin gap */}
      <div className="px-3 pt-1 pb-4">
        <div className="rounded-lg bg-zinc-900/60 border border-zinc-800/60 p-3 space-y-2">
          <span className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider">Estadísticas</span>
          {[
            { label: 'Activos hoy', val: hilos.filter(h => { const d = h.updatedAt?.toDate?.() || new Date(h.updatedAt); return d > new Date(Date.now() - 86400000); }).length },
            { label: 'Fijados', val: hilos.filter(h => h.pinned).length },
            { label: 'Cerrados', val: hilos.filter(h => h.locked).length },
          ].map(s => (
            <div key={s.label} className="flex items-center justify-between">
              <span className="text-zinc-600 text-xs">{s.label}</span>
              <span className="text-zinc-400 text-xs font-medium tabular-nums">{s.val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
), [hilos, archivedHilos, activeCategory, showArchived]);

  /* ═══════════════════════════════
     RENDER PRINCIPAL
  ═══════════════════════════════ */
  return (
    <div className="h-[calc(100vh-4rem)] flex bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden relative">
      {/* Progress bar */}
      <motion.div className="absolute top-0 left-0 right-0 h-0.5 bg-white origin-left z-50"
        style={{ scaleX }} />

      {/* ══════════════════════
          SIDEBAR — Desktop (siempre visible) / Mobile (drawer overlay)
      ══════════════════════ */}

      {/* Overlay móvil */}
      <AnimatePresence>
        {showSidebar && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
            onClick={() => setShowSidebar(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar desktop */}
      <aside className="hidden lg:flex w-56 flex-shrink-0 border-r border-zinc-800 flex-col bg-zinc-950 overflow-hidden h-full">
        <SidebarContent />
      </aside>

      {/* Sidebar mobile drawer */}
      <AnimatePresence>
        {showSidebar && (
          <motion.aside
            initial={{ x: -224 }} animate={{ x: 0 }} exit={{ x: -224 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed left-0 top-0 bottom-0 w-56 z-50 flex flex-col bg-zinc-950 border-r border-zinc-800 lg:hidden overflow-hidden"
          >
            <div className="flex items-center justify-between p-3 border-b border-zinc-800">
              <span className="text-white font-medium text-sm">Hilos</span>
              <button onClick={() => setShowSidebar(false)}
                className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <SidebarContent />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ══════════════════════
          LISTA DE HILOS
          En móvil: oculta cuando hay hilo seleccionado
      ══════════════════════ */}
      <div className={`flex-col border-r border-zinc-800 transition-all duration-300 bg-zinc-950
        ${selectedHilo ? 'hidden lg:flex lg:w-72 xl:w-80' : 'flex flex-1 lg:flex-none lg:w-72 xl:w-80'}
      `}>
        {/* Header lista */}
        <div className="h-14 flex items-center gap-2 px-3 border-b border-zinc-800 flex-shrink-0 bg-zinc-950/50 backdrop-blur-sm">
          {/* Hamburger solo en móvil */}
          <button onClick={() => setShowSidebar(true)}
            className="lg:hidden p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors flex-shrink-0">
            <Menu className="w-4 h-4" />
          </button>

          <div className="flex-1 min-w-0">
            <h2 className="text-white font-medium text-sm flex items-center gap-1.5 truncate">
              {showArchived && <Archive className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />}
              <span className="truncate">
                {showArchived ? 'Archivados' : activeCategory === 'all' ? 'Todos los hilos' : getCategoryInfo(activeCategory).label}
              </span>
            </h2>
            <p className="text-zinc-600 text-xs">{filteredHilos.length} hilos</p>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="relative hidden sm:block">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600" />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar..." className="bg-zinc-900 border border-zinc-800 rounded-lg pl-7 pr-2 py-1.5 text-xs text-white placeholder:text-zinc-600 w-28 focus:outline-none focus:border-zinc-600 transition-colors" />
            </div>
            <button onClick={() => setShowFilters(!showFilters)}
              className={`p-1.5 rounded-lg transition-colors ${showFilters ? 'bg-zinc-800 text-white' : 'text-zinc-600 hover:text-zinc-300'}`}>
              <Filter className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Búsqueda mobile */}
        <div className="px-3 py-2 border-b border-zinc-800/50 sm:hidden">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar hilos..." className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600" />
          </div>
        </div>

        {/* Filtros */}
        <AnimatePresence>
          {showFilters && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} className="border-b border-zinc-800 overflow-hidden">
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-600 text-xs">Ordenar:</span>
                  <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                    className="bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-300 px-2 py-1 focus:outline-none flex-1">
                    <option value="updated">Última actividad</option>
                    <option value="created">Más recientes</option>
                    <option value="popular">Más vistos</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-600 text-xs">Estado:</span>
                  <div className="flex bg-zinc-900 rounded-lg p-0.5 flex-1">
                    {(['all','open','closed'] as const).map(s => (
                      <button key={s} onClick={() => setFilterStatus(s)}
                        className={`flex-1 px-2 py-1 rounded text-xs transition-colors ${
                          filterStatus === s ? 'bg-zinc-800 text-white' : 'text-zinc-600 hover:text-zinc-400'
                        }`}>
                        {s === 'all' ? 'Todos' : s === 'open' ? 'Abiertos' : 'Cerrados'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lista hilos */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <RefreshCw className="w-5 h-5 animate-spin text-zinc-600" />
              <p className="text-zinc-600 text-xs">Cargando hilos...</p>
            </div>
          ) : filteredHilos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-4">
              <div className="w-14 h-14 bg-zinc-900 rounded-full flex items-center justify-center mb-4">
                {showArchived
                  ? <Archive className="w-7 h-7 text-zinc-700" strokeWidth={1.5} />
                  : <GitBranch className="w-7 h-7 text-zinc-700" strokeWidth={1.5} />}
              </div>
              <p className="text-zinc-400 text-sm font-medium mb-1">
                {showArchived ? 'Sin hilos archivados' : 'No hay hilos'}
              </p>
              <p className="text-zinc-600 text-xs">
                {showArchived ? 'Los hilos archivados aparecerán aquí' : 'Crea el primero con el botón de arriba'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-900/50">
              {filteredHilos.map((hilo, index) => {
                const cat = getCategoryInfo(hilo.category);
                const isSelected = selectedHilo?.id === hilo.id;
                const isUnread = hilo.lastReplyAt &&
                  new Date(hilo.lastReplyAt?.toDate?.() || hilo.lastReplyAt) > new Date(Date.now() - 86400000);
                return (
                  <motion.div key={hilo.id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                    onClick={() => setSelectedHilo(hilo)}
                    className={`px-3 py-3.5 cursor-pointer transition-all hover:bg-zinc-900/30 relative group border-l-2 ${
                      isSelected ? 'bg-zinc-900/60 border-l-white' : 'border-l-transparent'
                    } ${isUnread && !isSelected ? 'bg-zinc-900/20' : ''}`}>
                    {isUnread && !isSelected && (
                      <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-blue-500 rounded-full" />
                    )}
                    <div className="flex items-start gap-2.5">
                      <div className={`mt-0.5 p-1.5 rounded-lg flex-shrink-0 ${cat.bg}`}>
                        <cat.icon className={`w-3 h-3 ${cat.color}`} strokeWidth={1.5} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1.5 mb-1">
                          <h3 className={`text-sm font-medium leading-tight line-clamp-2 ${
                            isSelected ? 'text-white' : 'text-zinc-300 group-hover:text-white'}`}>
                            {hilo.title}
                          </h3>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {hilo.pinned && <Pin className="w-3 h-3 text-yellow-500 fill-yellow-500" />}
                            {hilo.locked && <Lock className="w-3 h-3 text-zinc-500" />}
                            {hilo.archived && <Archive className="w-3 h-3 text-zinc-600" />}
                          </div>
                        </div>
                        <p className="text-zinc-600 text-xs line-clamp-1 mb-2">{hilo.body}</p>
                        <div className="flex items-center gap-2 text-xs">
                          <div className="flex items-center gap-1">
                            <Avatar src={hilo.authorAvatar} name={hilo.authorName} size="sm" />
                            <span className="text-zinc-500 truncate max-w-[70px]">{hilo.authorName}</span>
                          </div>
                          <span className="text-zinc-700 flex items-center gap-0.5">
                            <MessageSquare className="w-3 h-3" />{hilo.replyCount}
                          </span>
                          <span className="text-zinc-700 flex items-center gap-0.5">
                            <Eye className="w-3 h-3" />{hilo.viewCount}
                          </span>
                          <span className="text-zinc-700 ml-auto text-[10px]">{formatRelative(hilo.updatedAt)}</span>
                        </div>
                        {hilo.tags?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {hilo.tags.slice(0, 2).map(tag => (
                              <span key={tag} className="text-zinc-600 text-[10px] bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded">#{tag}</span>
                            ))}
                            {hilo.tags.length > 2 && <span className="text-zinc-700 text-[10px]">+{hilo.tags.length - 2}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════
          DETALLE DEL HILO
          En móvil: ocupa toda la pantalla
      ══════════════════════ */}
      <AnimatePresence mode="wait">
        {selectedHilo ? (
          <motion.div key={selectedHilo.id}
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.15 }}
            className="flex-1 flex flex-col bg-zinc-950 min-w-0" ref={containerRef}>

            {/* Header detalle */}
            <div className="h-14 flex items-center gap-2 px-3 sm:px-4 border-b border-zinc-800 flex-shrink-0 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-10">
              <button onClick={() => setSelectedHilo(null)}
                className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors flex-shrink-0">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <h1 className="text-white font-medium text-sm truncate">{selectedHilo.title}</h1>
                <div className="flex items-center gap-1.5 text-xs text-zinc-600">
                  <span className="truncate max-w-[120px]">por {selectedHilo.authorName}</span>
                  <span>•</span>
                  <span className="flex-shrink-0">{formatRelative(selectedHilo.createdAt)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {onlineUsers.length > 0 && (
                  <div className="hidden sm:flex items-center gap-1 mr-1 px-2 py-1 bg-zinc-900 rounded-full">
                    <div className="flex -space-x-2">
                      {onlineUsers.slice(0, 3).map(u => <Avatar key={u.uid} src={u.avatar} name={u.displayName} size="sm" />)}
                    </div>
                    {onlineUsers.length > 3 && <span className="text-zinc-500 text-xs ml-1">+{onlineUsers.length - 3}</span>}
                  </div>
                )}
                <button onClick={() => toggleSubscription(selectedHilo)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    selectedHilo.subscribers?.includes(uid) ? 'text-blue-400 bg-blue-400/10' : 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800'
                  }`}>
                  {selectedHilo.subscribers?.includes(uid) ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                </button>
                <button onClick={() => shareHilo(selectedHilo)}
                  className="p-1.5 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors">
                  <Share2 className="w-4 h-4" />
                </button>
                {(isAdmin || selectedHilo.authorUid === uid) && (
                  <div className="relative group">
                    <button className="p-1.5 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 py-1">
  {/* Todas las opciones disponibles para admin O autor */}
  {(isAdmin || selectedHilo.authorUid === uid) && (
    <>
      <button onClick={() => togglePin(selectedHilo)}
        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors text-left">
        <Pin className="w-4 h-4" />{selectedHilo.pinned ? 'Desfijar' : 'Fijar'}
      </button>
      <button onClick={() => toggleLock(selectedHilo)}
        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors text-left">
        {selectedHilo.locked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
        {selectedHilo.locked ? 'Abrir hilo' : 'Cerrar hilo'}
      </button>
      <div className="border-t border-zinc-800 my-1" />
      {showArchived ? (
        <button onClick={() => unarchiveHilo(selectedHilo)}
          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors text-left">
          <ArchiveRestore className="w-4 h-4" />Desarchivar
        </button>
      ) : (
        <button onClick={() => archiveHilo(selectedHilo)}
          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors text-left">
          <Archive className="w-4 h-4" />Archivar
        </button>
      )}
      <div className="border-t border-zinc-800 my-1" />
      <button onClick={() => startEditHilo(selectedHilo)}
        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors text-left">
        <Edit3 className="w-4 h-4" />Editar hilo
      </button>
      <button onClick={() => deleteHilo(selectedHilo)}
        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-red-400/10 transition-colors text-left">
        <Trash2 className="w-4 h-4" />Eliminar hilo
      </button>
    </>
  )}
</div>
                  </div>
                )}
              </div>
            </div>

            {/* Contenido scrolleable */}
            <div className="flex-1 overflow-y-auto">
              {/* Mensaje original */}
              <div className="px-4 sm:px-6 py-5 border-b border-zinc-800/50">
                <div className="flex gap-3 sm:gap-4">
                  <Avatar src={selectedHilo.authorAvatar} name={selectedHilo.authorName} size="lg"
                    isOnline={onlineUsers.some(u => u.uid === selectedHilo.authorUid)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-white font-medium text-sm">{selectedHilo.authorName}</span>
                      <span className="text-zinc-600 text-xs px-2 py-0.5 bg-zinc-900 rounded-full">{selectedHilo.authorRole}</span>
                      <span className="text-zinc-700 text-xs ml-auto">{formatFull(selectedHilo.createdAt)}</span>
                      {selectedHilo.edited && <span className="text-zinc-700 text-xs">(editado)</span>}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                      {(() => {
                        const cat = getCategoryInfo(selectedHilo.category);
                        return (
                          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${cat.bg} ${cat.color} border border-zinc-800`}>
                            <cat.icon className="w-3 h-3" />{cat.label}
                          </span>
                        );
                      })()}
                      {selectedHilo.isAnnouncement && (
                        <span className="flex items-center gap-1 text-yellow-500 text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/20">
                          <Sparkles className="w-3 h-3" />Anuncio
                        </span>
                      )}
                      {selectedHilo.archived && (
                        <span className="flex items-center gap-1 text-zinc-500 text-xs px-2 py-0.5 rounded-full bg-zinc-500/10 border border-zinc-500/20">
                          <Archive className="w-3 h-3" />Archivado
                        </span>
                      )}
                      {selectedHilo.tags?.map(tag => (
                        <span key={tag} className="text-zinc-500 text-xs px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded-full">#{tag}</span>
                      ))}
                    </div>
                    <MarkdownRenderer content={selectedHilo.body} />
                    <AttachmentGrid attachments={selectedHilo.attachments} />
                    <div className="flex items-center gap-3 mt-4 pt-3 border-t border-zinc-800/50 flex-wrap">
                      <div className="flex items-center gap-3 text-xs text-zinc-600">
                        <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{selectedHilo.viewCount.toLocaleString()} vistas</span>
                        <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{selectedHilo.replyCount} respuestas</span>
                      </div>
                      <ReactionBar reactions={selectedHilo.reactions || {}} targetId={selectedHilo.id} isReply={false} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Replies */}
              <div className="px-4 sm:px-6 py-4">
                {loadingReplies ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <RefreshCw className="w-5 h-5 animate-spin text-zinc-600" />
                    <p className="text-zinc-600 text-xs">Cargando respuestas...</p>
                  </div>
                ) : replies.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-12 h-12 bg-zinc-900 rounded-full flex items-center justify-center mb-3">
                      <MessageSquare className="w-6 h-6 text-zinc-700" />
                    </div>
                    <p className="text-zinc-500 text-sm font-medium mb-1">Sin respuestas aún</p>
                    <p className="text-zinc-600 text-xs">Sé el primero en compartir tu opinión</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-5">
                      {replies.map((reply, idx) => (
                        <motion.div key={reply.id}
                          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.04 }} className="group">
                          {reply.parentId && (
                            <div className="flex items-center gap-2 mb-2 ml-10 text-xs text-zinc-600">
                              <ArrowLeft className="w-3 h-3 rotate-[-45deg]" />
                              <span>Respondiendo a <span className="text-zinc-500">
                                {replies.find(r => r.id === reply.parentId)?.authorName || 'mensaje'}
                              </span></span>
                            </div>
                          )}
                          <div className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <Avatar src={reply.authorAvatar} name={reply.authorName}
                                isOnline={onlineUsers.some(u => u.uid === reply.authorUid)} />
                              {idx < replies.length - 1 && <div className="w-px flex-1 bg-zinc-800 mt-2" />}
                            </div>
                            <div className="flex-1 min-w-0 pb-5">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="text-zinc-300 font-medium text-sm">{reply.authorName}</span>
                                <span className="text-zinc-600 text-xs">{reply.authorRole}</span>
                                <span className="text-zinc-700 text-xs ml-auto opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block">
                                  {formatFull(reply.createdAt)}
                                </span>
                                {reply.edited && <span className="text-zinc-700 text-xs">(editado)</span>}
                              </div>
                              <MarkdownRenderer content={reply.body} className="opacity-90" />
                              <AttachmentGrid attachments={reply.attachments} />
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <ReactionBar reactions={reply.reactions || {}} targetId={reply.id} isReply={true} />
                                <button onClick={() => setReplyingTo(reply)}
                                  className="text-zinc-600 hover:text-zinc-400 text-xs flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <ArrowLeft className="w-3 h-3 rotate-[-45deg]" />Responder
                                </button>
                                {(isAdmin || reply.authorUid === uid) && (
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                                    <button onClick={() => startEditReply(reply)} className="p-1 text-zinc-600 hover:text-zinc-400 rounded">
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => deleteReply(reply)} className="p-1 text-zinc-600 hover:text-red-400 rounded">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                    {hasMoreReplies && (
                      <div className="flex justify-center py-4">
                        <button onClick={() => loadReplies(selectedHilo.id, true)} disabled={loadingMore}
                          className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-sm rounded-lg transition-colors disabled:opacity-50">
                          {loadingMore ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4" />}
                          Cargar más respuestas
                        </button>
                      </div>
                    )}
                    <div ref={repliesEndRef} />
                  </>
                )}
              </div>
            </div>

            {/* Caja de reply */}
            <div className="border-t border-zinc-800 bg-zinc-950 flex-shrink-0">
              {selectedHilo.locked && !isAdmin ? (
                <div className="flex items-center justify-center gap-2 px-4 py-3 text-zinc-600 bg-zinc-900/30">
                  <Lock className="w-4 h-4" />
                  <span className="text-sm">Este hilo está cerrado</span>
                </div>
              ) : (
                <div className="p-3 sm:p-4">
                  {replyingTo && (
                    <div className="flex items-center justify-between px-3 py-2 mb-2 bg-zinc-900 rounded-lg border border-zinc-800">
                      <div className="flex items-center gap-2 text-xs text-zinc-500 min-w-0">
                        <ArrowLeft className="w-3 h-3 rotate-[-45deg] flex-shrink-0" />
                        <span className="truncate">Respondiendo a <span className="text-zinc-400">{replyingTo.authorName}</span></span>
                      </div>
                      <button onClick={() => setReplyingTo(null)} className="text-zinc-600 hover:text-zinc-400 flex-shrink-0 ml-2">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  {editingReply && (
                    <div className="flex items-center justify-between px-3 py-2 mb-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
                      <div className="flex items-center gap-2 text-xs text-blue-400">
                        <Edit3 className="w-3 h-3" /><span>Editando mensaje</span>
                      </div>
                      <button onClick={() => { setEditingReply(null); setReplyBody(''); setReplyAttachments([]); }}
                        className="text-zinc-600 hover:text-zinc-400">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <AttachmentGrid attachments={replyAttachments}
                    onRemove={i => setReplyAttachments(prev => prev.filter((_, idx) => idx !== i))} />
                  <div className="flex gap-2 sm:gap-3 mt-2">
                    <Avatar src={userProfile?.avatar} name={userProfile?.displayName || ''} />
                    <div className="flex-1 relative min-w-0">
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden focus-within:border-zinc-700 focus-within:ring-1 focus-within:ring-zinc-700 transition-all">
                        <textarea ref={replyTextRef} value={replyBody}
                          onChange={e => {
                            setReplyBody(e.target.value);
                            if (e.target.value.slice(-1) === '@') { setShowMentions(true); setCursorPosition(e.target.selectionStart); }
                            else if (showMentions && !e.target.value.includes('@')) setShowMentions(false);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                              e.preventDefault();
                              editingReply ? handleUpdateReply() : handleReply();
                            }
                          }}
                          placeholder={replyingTo ? `Respondiendo a ${replyingTo.authorName}...` : 'Escribe una respuesta... (Ctrl+Enter para enviar)'}
                          rows={3} maxLength={5000}
                          className="w-full bg-transparent text-white text-sm focus:outline-none resize-none placeholder:text-zinc-600 leading-relaxed px-3 py-2.5"
                        />
                        <MentionSuggestions />
                        <div className="flex items-center justify-between px-2.5 py-2 border-t border-zinc-800/50">
                          <div className="flex items-center gap-1">
  <input ref={fileReplyRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt"
    className="hidden"
    onChange={e => e.target.files && uploadFiles(e.target.files, setReplyAttachments, setUploadingReply)} />
  <button onClick={() => fileReplyRef.current?.click()} disabled={uploadingReply}
    className="p-1.5 text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 rounded-lg transition-colors">
    {uploadingReply ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
  </button>
  <button onClick={() => setReplyBody(p => p + '**texto**')}
    className="p-1.5 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded text-xs font-bold transition-colors" title="Negrita">B</button>
  <button onClick={() => setReplyBody(p => p + '*texto*')}
    className="p-1.5 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded text-xs italic transition-colors" title="Cursiva">I</button>
  <button onClick={() => setReplyBody(p => p + '\n# ')}
    className="p-1.5 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded text-xs font-semibold transition-colors" title="Título">#</button>
  <button onClick={() => setReplyBody(p => p + '\n- ')}
    className="p-1.5 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded text-xs transition-colors" title="Lista">•</button>
  <button onClick={() => setReplyBody(p => p + '\n```js\n\n```')}
    className="p-1.5 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded text-xs font-mono transition-colors" title="Código">{`</>`}</button>
  <button onClick={() => setReplyBody(p => p + '\n> ')}
    className="p-1.5 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded text-xs transition-colors" title="Cita">❝</button>
</div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs hidden sm:block transition-colors ${replyBody.length > 4500 ? 'text-red-500' : 'text-zinc-600'}`}>
                              {replyBody.length}/5000
                            </span>
                            <button
                              onClick={editingReply ? handleUpdateReply : handleReply}
                              disabled={submittingReply || !replyBody.trim()}
                              className="flex items-center gap-1.5 bg-white text-black hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium px-3 py-1.5 rounded-lg">
                              {submittingReply ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                : editingReply ? <Check className="w-3.5 h-3.5" />
                                : <Send className="w-3.5 h-3.5" />}
                              <span className="hidden sm:inline">{editingReply ? 'Guardar' : 'Enviar'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="hidden lg:flex flex-1 flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-5 relative">
              <GitBranch className="w-10 h-10 text-zinc-700" strokeWidth={1} />
            </div>
            <h3 className="text-zinc-400 font-medium text-base mb-2">Selecciona un hilo</h3>
            <p className="text-zinc-600 text-sm max-w-xs">Elige una conversación o crea una nueva</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════
          MODAL NUEVO/EDITAR HILO
      ══════════════════════ */}
      <Dialog open={showNewHilo} onOpenChange={open => { if (!open) { resetNewHilo(); setEditingHilo(null); } setShowNewHilo(open); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white w-[95vw] max-w-2xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 sm:px-6 py-4 border-b border-zinc-800">
            <DialogTitle className="font-medium text-sm flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-zinc-400" />
              {editingHilo ? 'Editar hilo' : 'Nuevo hilo'}
            </DialogTitle>
            <DialogDescription className="sr-only">{editingHilo ? 'Editar el hilo' : 'Crear un nuevo hilo'}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-zinc-800">
              <label className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-3 block">Categoría</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(cat => (
                  <button key={cat.id} onClick={() => setNewCategory(cat.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      newCategory === cat.id ? 'bg-zinc-800 border-zinc-600 text-white' : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                    }`}>
                    <cat.icon className={`w-3.5 h-3.5 ${newCategory === cat.id ? 'text-white' : cat.color}`} strokeWidth={1.5} />
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-4 sm:px-6 py-4 border-b border-zinc-800">
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Título descriptivo..."
                maxLength={200} className="w-full bg-transparent text-white text-base sm:text-lg font-medium focus:outline-none placeholder:text-zinc-700" />
              <div className="flex justify-end mt-1">
                <span className="text-zinc-700 text-xs">{newTitle.length}/200</span>
              </div>
            </div>
            <div className="px-4 sm:px-6 py-4 border-b border-zinc-800">
              <textarea value={newBody} onChange={e => setNewBody(e.target.value)} placeholder="Describe tu tema en detalle..."
                rows={8} maxLength={10000} className="w-full bg-transparent text-zinc-300 text-sm focus:outline-none resize-none placeholder:text-zinc-700 leading-relaxed" />
              <div className="flex justify-between items-center mt-2">
                <div className="flex gap-1">
  <button onClick={() => setNewBody(p => p + '**texto**')}
    className="p-1.5 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded text-xs font-bold transition-colors" title="Negrita">B</button>
  <button onClick={() => setNewBody(p => p + '*texto*')}
    className="p-1.5 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded text-xs italic transition-colors" title="Cursiva">I</button>
  <button onClick={() => setNewBody(p => p + '\n# ')}
    className="p-1.5 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded text-xs font-semibold transition-colors" title="Título">#</button>
  <button onClick={() => setNewBody(p => p + '\n- ')}
    className="p-1.5 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded text-xs transition-colors" title="Lista">•</button>
  <button onClick={() => setNewBody(p => p + '\n```js\n\n```')}
    className="p-1.5 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded text-xs font-mono transition-colors" title="Código">{`</>`}</button>
  <button onClick={() => setNewBody(p => p + '\n> ')}
    className="p-1.5 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded text-xs transition-colors" title="Cita">❝</button>
</div>
                <span className={`text-xs ${newBody.length > 9000 ? 'text-red-500' : 'text-zinc-700'}`}>{newBody.length}/10000</span>
              </div>
            </div>
            <div className="px-4 sm:px-6 py-3 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <Hash className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                <input value={newTags} onChange={e => setNewTags(e.target.value)}
                  placeholder="Tags separados por comas (máx. 5)"
                  className="flex-1 bg-transparent text-zinc-300 text-sm focus:outline-none placeholder:text-zinc-700" />
              </div>
            </div>
            {isAdmin && (
              <div className="px-4 sm:px-6 py-3 border-b border-zinc-800">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={isAnnouncement} onChange={e => setIsAnnouncement(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-700 bg-zinc-900" />
                  <span className="text-sm text-zinc-400">Marcar como anuncio</span>
                  <Sparkles className="w-4 h-4 text-yellow-500" />
                </label>
              </div>
            )}
            {newAttachments.length > 0 && (
              <div className="px-4 sm:px-6 py-3 border-b border-zinc-800 bg-zinc-900/30">
                <AttachmentGrid attachments={newAttachments}
                  onRemove={i => setNewAttachments(prev => prev.filter((_, idx) => idx !== i))} />
              </div>
            )}
          </div>
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-t border-zinc-800">
            <div>
              <input ref={fileNewRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt" className="hidden"
                onChange={e => e.target.files && uploadFiles(e.target.files, setNewAttachments, setUploadingFiles)} />
              <button onClick={() => fileNewRef.current?.click()} disabled={uploadingFiles}
                className="flex items-center gap-2 text-zinc-500 hover:text-white text-sm transition-colors px-2 py-1.5 rounded-lg hover:bg-zinc-900">
                {uploadingFiles ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                <span className="hidden sm:inline">{uploadingFiles ? 'Subiendo...' : 'Adjuntar'}</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => { resetNewHilo(); setEditingHilo(null); setShowNewHilo(false); }}
                className="text-zinc-500 hover:text-white text-sm">Cancelar</Button>
              <Button onClick={editingHilo ? handleUpdateHilo : handleCreateHilo}
                disabled={submitting || !newTitle.trim() || !newBody.trim()}
                className="bg-white text-black hover:bg-zinc-200 font-medium gap-2 text-sm">
                {submitting ? <><RefreshCw className="w-4 h-4 animate-spin" />Guardando...</>
                  : editingHilo ? <><Check className="w-4 h-4" />Guardar</>
                  : <><Send className="w-4 h-4" />Publicar</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════
          VISOR DE ARCHIVOS
      ══════════════════════ */}
      <Dialog open={!!viewerFile} onOpenChange={open => !open && setViewerFile(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 w-[95vw] !max-w-5xl p-0 overflow-hidden">
          <DialogDescription className="sr-only">Vista previa del archivo</DialogDescription>
          {viewerFile && (
            <div className="flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 bg-zinc-900 rounded-lg flex-shrink-0">
                    <File className="w-4 h-4 text-zinc-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{viewerFile.name}</p>
                    <p className="text-zinc-600 text-xs">{formatSize(viewerFile.size)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => handleDownload(viewerFile)}
                    className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
                    <Download className="w-4 h-4" />
                  </button>
                  <a href={viewerFile.url} target="_blank" rel="noopener noreferrer"
                    className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors inline-flex">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button onClick={() => setViewerFile(null)}
                    className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center p-4 bg-zinc-950 overflow-auto">
                {viewerFile.type.startsWith('image/') ? (
                  <img src={viewerFile.url} alt={viewerFile.name}
                    className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-2xl" />
                ) : viewerFile.type === 'application/pdf' ? (
                  <iframe src={`${viewerFile.url}#toolbar=1`} className="w-full h-[70vh] border-0 rounded-lg" title={viewerFile.name} />
                ) : (
                  viewerFile.type.includes('word') || viewerFile.type.includes('excel') ||
                  viewerFile.type.includes('spreadsheet') || viewerFile.type.includes('presentation') ||
                  viewerFile.type.includes('powerpoint') ||
                  viewerFile.name.match(/\.(docx?|xlsx?|pptx?|odt|ods|odp)$/i) ? (
                    <iframe src={getGoogleViewerUrl(viewerFile.url)} className="w-full h-[70vh] border-0 rounded-lg" title={viewerFile.name} />
                  ) : (
                    <div className="text-center py-12">
                      <File className="w-14 h-14 text-zinc-700 mx-auto mb-4" />
                      <p className="text-zinc-500 text-sm mb-4">Vista previa no disponible</p>
                      <div className="flex items-center justify-center gap-3 flex-wrap">
                        <a href={viewerFile.url} target="_blank" rel="noopener noreferrer"
                          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded-lg transition-colors inline-flex items-center gap-2">
                          <ExternalLink className="w-4 h-4" />Abrir en pestaña
                        </a>
                        <button onClick={() => handleDownload(viewerFile)}
                          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded-lg transition-colors inline-flex items-center gap-2">
                          <Download className="w-4 h-4" />Descargar
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ══════════════════════
          MODAL COMPARTIR
      ══════════════════════ */}
      <Dialog open={showShareModal} onOpenChange={open => { setShowShareModal(open); if (!open) setShowQR(false); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle className="font-medium flex items-center gap-2">
              <Share2 className="w-4 h-4" />Compartir hilo
            </DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">
              Cualquiera con este enlace podrá leer el hilo sin login.
            </DialogDescription>
          </DialogHeader>
          {selectedHilo && (
            <div className="p-4 sm:p-6 space-y-4">
              <div>
                <label className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-2 block">Enlace público</label>
                <div className="flex items-center gap-2 p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                  <input type="text" value={getShareUrl(selectedHilo.id)} readOnly
                    className="flex-1 bg-transparent text-xs text-zinc-400 focus:outline-none min-w-0" />
                  <button onClick={() => copyLink(selectedHilo.id)}
                    className={`p-2 rounded-lg transition-all flex-shrink-0 ${linkCopied ? 'text-green-400 bg-green-400/10' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}>
                    {linkCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                {linkCopied && <p className="text-green-400 text-xs mt-1.5 flex items-center gap-1"><Check className="w-3 h-3" />Enlace copiado</p>}
              </div>
              <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <Eye className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-blue-300 text-xs font-medium">Modo lectura</p>
                  <p className="text-blue-400/70 text-xs mt-0.5">El visitante puede leer el hilo y comentarios. Para participar necesita iniciar sesión.</p>
                </div>
              </div>
              <div>
                <button onClick={() => setShowQR(!showQR)}
                  className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
                  <QrCode className="w-4 h-4" />
                  {showQR ? 'Ocultar QR' : 'Mostrar QR'}
                  <ChevronDown className={`w-3 h-3 transition-transform ${showQR ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {showQR && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="mt-3 flex flex-col items-center gap-3 p-4 bg-zinc-900 rounded-xl border border-zinc-800">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getShareUrl(selectedHilo.id))}&bgcolor=18181b&color=ffffff&margin=2`}
                          alt="QR Code" className="w-40 h-40 rounded-lg" loading="lazy" />
                        <p className="text-zinc-600 text-xs">Escanea con la cámara del móvil</p>
                        <a href={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(getShareUrl(selectedHilo.id))}&bgcolor=18181b&color=ffffff&margin=2`}
                          download={`qr-hilo-${selectedHilo.id}.png`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-xs transition-colors">
                          <Download className="w-3.5 h-3.5" />Descargar QR
                        </a>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ═══════════════════════════════
   OBSERVER VIEW — Vista pública sin login
═══════════════════════════════ */
export const HilosObserverView: React.FC<{ hiloId: string }> = ({ hiloId }) => {
  const [hilo, setHilo] = useState<Hilo | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerFile, setViewerFile] = useState<Attachment | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'hilos', hiloId));
        if (!snap.exists() || snap.data().deleted) {
          setError('Este hilo no existe o fue eliminado.'); setLoading(false); return;
        }
        setHilo({ id: snap.id, ...snap.data() } as Hilo);
        const rSnap = await getDocs(query(collection(db, 'hilos', hiloId, 'replies'), orderBy('createdAt', 'asc'), limit(20)));
        setReplies(rSnap.docs.map(d => ({ id: d.id, ...d.data() } as Reply)));
      } catch (err) {
        console.error('Observer load error:', err);
        setError('No se pudo cargar el hilo.');
      } finally { setLoading(false); }
    };
    load();
  }, [hiloId]);

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <RefreshCw className="w-8 h-8 animate-spin text-zinc-400" />
    </div>
  );
  if (error || !hilo) return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertCircle className="w-12 h-12 text-red-400" />
      <p className="text-zinc-300 text-lg font-medium">{error || 'Hilo no encontrado'}</p>
      <a href="/" className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-zinc-200">Ir al inicio</a>
    </div>
  );

  const cat = getCategoryInfo(hilo.category);
  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="sticky top-0 z-50 bg-zinc-900/95 backdrop-blur border-b border-zinc-800 px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-zinc-400 min-w-0">
          <Eye className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">Modo <span className="font-medium text-zinc-300">lectura</span></span>
        </div>
        <a href="/login" className="flex-shrink-0 px-3 py-1.5 bg-white text-black rounded-lg text-xs font-medium hover:bg-zinc-200 transition-colors">
          Iniciar sesión →
        </a>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 sm:p-6 mb-5">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${cat.bg} ${cat.color} border border-zinc-800`}>
              <cat.icon className="w-3 h-3" />{cat.label}
            </span>
            {hilo.isAnnouncement && (
              <span className="flex items-center gap-1 text-yellow-500 text-xs px-2.5 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20">
                <Sparkles className="w-3 h-3" />Anuncio
              </span>
            )}
            {hilo.tags?.map(tag => (
              <span key={tag} className="text-zinc-500 text-xs px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded-full">#{tag}</span>
            ))}
          </div>
          <h1 className="text-white text-lg sm:text-xl font-semibold mb-3">{hilo.title}</h1>
          <div className="flex items-center gap-2 mb-4 text-xs text-zinc-500 flex-wrap">
            <span className="font-medium text-zinc-400">{hilo.authorName}</span>
            <span>•</span><span>{hilo.authorRole}</span>
            <span>•</span><span>{formatFull(hilo.createdAt)}</span>
            {hilo.edited && <span>(editado)</span>}
          </div>
          <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap mb-4">{hilo.body}</p>
          {hilo.attachments?.length > 0 && (
            <div className={`grid gap-2 mt-4 ${hilo.attachments.length === 1 ? 'grid-cols-1 max-w-md' : 'grid-cols-2'}`}>
              {hilo.attachments.map(att => (
                <div key={att.id} className="rounded-lg overflow-hidden border border-zinc-700 bg-zinc-800">
                  {att.type.startsWith('image/') ? (
                    <div className="relative aspect-video cursor-pointer" onClick={() => setViewerFile(att)}>
                      <img src={att.thumbnailUrl || att.url} alt={att.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 bg-black/40 transition-opacity"><Eye className="w-6 h-6 text-white" /></div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-3">
                      <File className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-zinc-200 text-xs font-medium truncate">{att.name}</p>
                        <p className="text-zinc-500 text-xs">{formatSize(att.size)}</p>
                      </div>
                      <button onClick={() => setViewerFile(att)} className="p-1.5 text-zinc-500 hover:text-white rounded transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-zinc-800 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />{hilo.viewCount} vistas</span>
            <span className="flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" />{hilo.replyCount} respuestas</span>
          </div>
        </div>
        <div className="space-y-3 mb-8">
          <h2 className="text-zinc-400 text-sm font-medium">{replies.length} {replies.length === 1 ? 'respuesta' : 'respuestas'}</h2>
          {replies.map(reply => (
            <div key={reply.id} className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
              <div className="flex items-center gap-2 mb-2 text-xs flex-wrap">
                <span className="font-medium text-zinc-300">{reply.authorName}</span>
                <span className="text-zinc-600">{reply.authorRole}</span>
                <span className="text-zinc-700 ml-auto">{formatFull(reply.createdAt)}</span>
              </div>
              <MarkdownRenderer content={reply.body} className="opacity-90" />
            </div>
          ))}
          {hilo.replyCount > 20 && (
            <p className="text-center text-zinc-600 text-xs py-2">
              Inicia sesión para ver las {hilo.replyCount} respuestas completas
            </p>
          )}
        </div>
        <div className="text-center">
          <p className="text-zinc-600 text-sm mb-3">¿Quieres participar en esta discusión?</p>
          <a href="/login" className="inline-flex items-center gap-2 px-6 py-2.5 bg-white text-black rounded-lg font-medium text-sm hover:bg-zinc-200 transition-colors">
            Iniciar sesión
          </a>
        </div>
      </div>
      {/* Visor observer */}
      <Dialog open={!!viewerFile} onOpenChange={open => !open && setViewerFile(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 w-[95vw] !max-w-5xl p-0 overflow-hidden">
          <DialogDescription className="sr-only">Vista previa del archivo</DialogDescription>
          {viewerFile && (
            <div className="flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <p className="text-white text-sm font-medium truncate">{viewerFile.name}</p>
                <button onClick={() => setViewerFile(null)} className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg ml-2">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 p-4 bg-zinc-950 overflow-auto">
                {viewerFile.type.startsWith('image/') ? (
                  <img src={viewerFile.url} alt={viewerFile.name} className="max-w-full max-h-[70vh] object-contain rounded-lg mx-auto block" />
                ) : viewerFile.type === 'application/pdf' ? (
                  <iframe src={viewerFile.url} className="w-full h-[70vh] border-0 rounded-lg" title={viewerFile.name} />
                ) : (
                  <iframe src={getGoogleViewerUrl(viewerFile.url)} className="w-full h-[70vh] border-0 rounded-lg" title={viewerFile.name} />
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HilosComponent;