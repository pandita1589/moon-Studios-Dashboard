import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getAllUsers } from '@/lib/firebase';
import { db } from '@/lib/firebase';
import { supabase } from '@/lib/supabaseclient';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, where, orderBy, Timestamp,
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Mail, Send, Inbox, FileText, Trash2, Plus, Search,
  Paperclip, X, Reply, Forward, Image, File, Download, Eye, Star,
  RefreshCw, ArrowLeft,
} from 'lucide-react';
import type { UserProfile } from '@/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/* ── Tipos ──────────────────────────────────────────────────────────────────── */
interface Attachment { url: string; name: string; type: string; size: number; }
interface Correo {
  id: string; fromUid: string; fromName: string; fromAvatar?: string; fromRole: string;
  toUid: string; toName: string; toAvatar?: string; subject: string; body: string;
  attachments: Attachment[]; createdAt: any; read: boolean; starred: boolean;
  deleted: boolean; deletedBy?: string; draft: boolean; replyToId?: string;
  replyToSubject?: string; forwarded?: boolean;
}
type Folder = 'inbox' | 'sent' | 'drafts' | 'trash' | 'starred';

const CORREOS_BUCKET = 'correos';

/* ── Helpers ────────────────────────────────────────────────────────────────── */
const formatSize = (b: number) => b < 1024 ? `${b} B` : b < 1024*1024 ? `${(b/1024).toFixed(1)} KB` : `${(b/1024/1024).toFixed(2)} MB`;
const formatDate = (ts: any) => {
  if (!ts) return '';
  const date = ts?.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return 'Ahora';
  if (diff < 3600000) return `${Math.floor(diff/60000)}m`;
  if (diff < 86400000) return format(date, 'HH:mm');
  if (diff < 604800000) return format(date, 'EEE', { locale: es });
  return format(date, 'd MMM', { locale: es });
};

/* ── Design tokens ──────────────────────────────────────────────────────────── */
const bd = 'hsl(var(--border))';
const sf = 'hsl(var(--card))';
const sc = 'hsl(var(--secondary))';
const mt = 'hsl(var(--muted-foreground))';

/* ══════════════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
══════════════════════════════════════════════════════════════════════════════ */
const CorreoComponent: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const uid = currentUser?.uid || '';

  const [users,            setUsers]            = useState<UserProfile[]>([]);
  const [correos,          setCorreos]          = useState<Correo[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [activeFolder,     setActiveFolder]     = useState<Folder>('inbox');
  const [selectedMail,     setSelectedMail]     = useState<Correo | null>(null);
  const [searchQuery,      setSearchQuery]      = useState('');
  const [showCompose,      setShowCompose]      = useState(false);
  const [showViewer,       setShowViewer]       = useState(false);
  const [viewerFile,       setViewerFile]       = useState<Attachment | null>(null);
  const [newMailAlert,     setNewMailAlert]     = useState(false);

  const prevUnreadRef = useRef(0);

  const [composeTo,         setComposeTo]         = useState<UserProfile | null>(null);
  const [composeSubject,    setComposeSubject]    = useState('');
  const [composeBody,       setComposeBody]       = useState('');
  const [composeAttachments,setComposeAttachments]= useState<Attachment[]>([]);
  const [uploadingFiles,    setUploadingFiles]    = useState(false);
  const [sendingMail,       setSendingMail]       = useState(false);
  const [userSearch,        setUserSearch]        = useState('');
  const [showUserDropdown,  setShowUserDropdown]  = useState(false);
  const [editingDraftId,    setEditingDraftId]    = useState<string | null>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { getAllUsers().then(d => setUsers(d as UserProfile[])); }, []);

  useEffect(() => {
    if (!uid) return;
    const merge = (prev: Correo[], incoming: Correo[]) => {
      const ids = new Set(incoming.map(m => m.id));
      return [...prev.filter(m => !ids.has(m.id)), ...incoming].sort((a, b) => {
        const ta = a.createdAt?.toDate?.() ?? new Date(a.createdAt);
        const tb = b.createdAt?.toDate?.() ?? new Date(b.createdAt);
        return tb.getTime() - ta.getTime();
      });
    };
    const qIn  = query(collection(db, 'correos'), where('toUid',   '==', uid), orderBy('createdAt', 'desc'));
    const qOut = query(collection(db, 'correos'), where('fromUid', '==', uid), orderBy('createdAt', 'desc'));
    const u1 = onSnapshot(qIn,  snap => { setCorreos(p => merge(p, snap.docs.map(d => ({ id: d.id, ...d.data() } as Correo)))); setLoading(false); });
    const u2 = onSnapshot(qOut, snap => { setCorreos(p => merge(p, snap.docs.map(d => ({ id: d.id, ...d.data() } as Correo)))); setLoading(false); });
    return () => { u1(); u2(); };
  }, [uid]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) setShowUserDropdown(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); resetCompose(); setShowCompose(true); }
      if (e.key === 'Escape' && showCompose) { setShowCompose(false); resetCompose(); }
      if (e.key === 'Escape' && !showCompose && selectedMail) setSelectedMail(null);
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [showCompose, selectedMail]);

  useEffect(() => {
    if (!selectedMail) return;
    const updated = correos.find(m => m.id === selectedMail.id);
    if (updated) setSelectedMail(updated);
  }, [correos]);

  const folderMails = correos.filter(m => {
    if (activeFolder === 'inbox')   return m.toUid === uid && !m.deleted && !m.draft;
    if (activeFolder === 'sent')    return m.fromUid === uid && !m.deleted && !m.draft;
    if (activeFolder === 'drafts')  return m.fromUid === uid && m.draft && !m.deleted;
    if (activeFolder === 'trash')   return m.deletedBy === uid && m.deleted;
    if (activeFolder === 'starred') return (m.toUid === uid || m.fromUid === uid) && m.starred && !m.deleted;
    return false;
  }).filter(m => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return m.subject?.toLowerCase().includes(q) || m.body?.toLowerCase().includes(q) || m.fromName?.toLowerCase().includes(q) || m.toName?.toLowerCase().includes(q);
  });

  const unreadCount = correos.filter(m => m.toUid === uid && !m.read && !m.deleted && !m.draft).length;
  const draftCount  = correos.filter(m => m.fromUid === uid && m.draft && !m.deleted).length;

  useEffect(() => {
    if (unreadCount > prevUnreadRef.current) {
      setNewMailAlert(true);
      const t = setTimeout(() => setNewMailAlert(false), 4000);
      prevUnreadRef.current = unreadCount;
      return () => clearTimeout(t);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  const markRead    = async (mail: Correo) => { if (mail.toUid === uid && !mail.read) await updateDoc(doc(db, 'correos', mail.id), { read: true }); setSelectedMail({ ...mail, read: true }); };
  const toggleStar  = async (mail: Correo, e?: React.MouseEvent) => { e?.stopPropagation(); await updateDoc(doc(db, 'correos', mail.id), { starred: !mail.starred }); };
  const getSupabasePath = (url: string) => { try { return decodeURIComponent(new URL(url).pathname.split(`/correos/`)[1] || ''); } catch { return ''; } };

  const deleteMail = async (mail: Correo) => {
    if (mail.deleted) {
      if (!confirm('¿Eliminar permanentemente?')) return;
      if (mail.attachments?.length > 0) { const paths = mail.attachments.map(a => getSupabasePath(a.url)).filter(Boolean); if (paths.length > 0) await supabase.storage.from(CORREOS_BUCKET).remove(paths); }
      await deleteDoc(doc(db, 'correos', mail.id));
      setCorreos(p => p.filter(m => m.id !== mail.id));
    } else {
      await updateDoc(doc(db, 'correos', mail.id), { deleted: true, deletedBy: uid });
      setCorreos(p => p.map(m => m.id === mail.id ? { ...m, deleted: true, deletedBy: uid } : m));
    }
    setSelectedMail(null);
  };

  const restoreMail = async (mail: Correo) => { await updateDoc(doc(db, 'correos', mail.id), { deleted: false, deletedBy: null }); };

  const emptyTrash = async () => {
    const trash = correos.filter(m => m.deletedBy === uid && m.deleted);
    if (!trash.length || !confirm(`¿Eliminar permanentemente ${trash.length} correo(s)?`)) return;
    const ids = new Set<string>();
    for (const mail of trash) {
      if (mail.attachments?.length > 0) { const paths = mail.attachments.map(a => getSupabasePath(a.url)).filter(Boolean); if (paths.length > 0) await supabase.storage.from(CORREOS_BUCKET).remove(paths); }
      await deleteDoc(doc(db, 'correos', mail.id));
      ids.add(mail.id);
    }
    setCorreos(p => p.filter(m => !ids.has(m.id)));
    setSelectedMail(null);
  };

  const compressImage = (file: File, maxKB = 400): Promise<File> => new Promise(resolve => {
    if (!file.type.startsWith('image/') || file.size < maxKB * 1024) { resolve(file); return; }
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ratio = Math.min(1200/img.width, 1200/img.height, 1);
      canvas.width = img.width * ratio; canvas.height = img.height * ratio;
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        URL.revokeObjectURL(objectUrl);
        if (!blob) { resolve(file); return; }
        const c = new Blob([blob], { type: 'image/jpeg' }) as any;
        c.name = file.name; c.lastModified = Date.now(); resolve(c as File);
      }, 'image/jpeg', 0.82);
    };
    img.src = objectUrl;
  });

  const handleFileUpload = async (files: FileList) => {
    setUploadingFiles(true);
    const newAtts: Attachment[] = [];
    for (const file of Array.from(files)) {
      const c = await compressImage(file);
      const path = `${uid}/${Date.now()}_correo_${c.name}`;
      const { error } = await supabase.storage.from(CORREOS_BUCKET).upload(path, c, { upsert: true });
      if (!error) { const { data } = supabase.storage.from(CORREOS_BUCKET).getPublicUrl(path); newAtts.push({ url: data.publicUrl, name: c.name, type: c.type, size: c.size }); }
    }
    setComposeAttachments(p => [...p, ...newAtts]);
    setUploadingFiles(false);
  };

  const handleSend = async (asDraft = false) => {
    if (!asDraft && (!composeTo || !composeSubject.trim() || !composeBody.trim())) { alert('Completa destinatario, asunto y mensaje'); return; }
    setSendingMail(true);
    try {
      const payload = {
        fromUid: uid, fromName: userProfile?.displayName || '', fromAvatar: userProfile?.avatar || '',
        fromRole: userProfile?.role || '', toUid: composeTo?.uid || '', toName: composeTo?.displayName || '',
        toAvatar: composeTo?.avatar || '', subject: composeSubject, body: composeBody,
        attachments: composeAttachments, createdAt: Timestamp.now(), read: false, starred: false, deleted: false, draft: asDraft, forwarded: false,
      };
      if (editingDraftId) await updateDoc(doc(db, 'correos', editingDraftId), payload);
      else await addDoc(collection(db, 'correos'), payload);
      resetCompose(); setShowCompose(false);
    } catch (e) { console.error(e); alert('Error al enviar'); }
    finally { setSendingMail(false); }
  };

  const resetCompose = () => { setComposeTo(null); setComposeSubject(''); setComposeBody(''); setComposeAttachments([]); setUserSearch(''); setEditingDraftId(null); };
  const openReply   = (mail: Correo) => { setComposeTo(users.find(u => u.uid === mail.fromUid) || null); setComposeSubject(`Re: ${mail.subject}`); setComposeBody(`\n\n--- Mensaje original de ${mail.fromName} ---\n${mail.body}`); setComposeAttachments([]); setEditingDraftId(null); setShowCompose(true); };
  const openForward = (mail: Correo) => { setComposeTo(null); setComposeSubject(`Fwd: ${mail.subject}`); setComposeBody(`\n\n--- Reenviado de ${mail.fromName} ---\n${mail.body}`); setComposeAttachments(mail.attachments || []); setEditingDraftId(null); setShowCompose(true); };
  const openDraft   = (mail: Correo) => { setComposeTo(users.find(u => u.uid === mail.toUid) || null); setComposeSubject(mail.subject); setComposeBody(mail.body); setComposeAttachments(mail.attachments || []); setEditingDraftId(mail.id); setShowCompose(true); };
  const handleDownload = async (att: Attachment) => { const res = await fetch(att.url); const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = att.name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); };
  const filteredUsers = users.filter(u => u.uid !== uid && (u.displayName?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase())));

  const FOLDERS = [
    { id: 'inbox',   label: 'Bandeja de entrada', icon: Inbox,    badge: unreadCount },
    { id: 'sent',    label: 'Enviados',             icon: Send,     badge: 0 },
    { id: 'starred', label: 'Destacados',           icon: Star,     badge: 0 },
    { id: 'drafts',  label: 'Borradores',           icon: FileText, badge: draftCount },
    { id: 'trash',   label: 'Papelera',             icon: Trash2,   badge: 0 },
  ] as const;

  const emptyStates: Record<Folder, { icon: React.ElementType; title: string; sub: string }> = {
    inbox:   { icon: Inbox,    title: 'Bandeja vacía',     sub: 'No tienes correos nuevos' },
    sent:    { icon: Send,     title: 'Nada enviado aún',  sub: 'Los correos enviados aparecerán aquí' },
    drafts:  { icon: FileText, title: 'Sin borradores',    sub: 'Guarda un correo como borrador' },
    trash:   { icon: Trash2,   title: 'Papelera vacía',    sub: 'Los correos eliminados aparecerán aquí' },
    starred: { icon: Star,     title: 'Sin destacados',    sub: 'Marca correos con estrella' },
  };

  /* ── Layout helpers ── */
  const Avatar = ({ src, name, size = 'md' }: { src?: string; name?: string; size?: 'sm' | 'md' }) => {
    const s = size === 'sm' ? 'w-6 h-6 rounded-lg text-xs' : 'w-9 h-9 rounded-xl text-sm';
    return (
      <div className={`${s} flex-shrink-0 overflow-hidden flex items-center justify-center`}
        style={{ background: 'hsl(var(--muted))', border: `1px solid ${bd}` }}>
        {src ? <img src={src} alt={name} className="w-full h-full object-cover" /> : <span className="text-white font-light">{name?.[0]?.toUpperCase()}</span>}
      </div>
    );
  };

  /* ══════════════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="h-[calc(100vh-7rem)] flex rounded-2xl overflow-hidden border relative animate-fade-in"
      style={{ background: 'hsl(var(--background))', borderColor: bd }}>

      {/* New mail banner */}
      <AnimatePresence>
        {newMailAlert && (
          <motion.div initial={{ opacity: 0, y: -40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -40 }} transition={{ duration: 0.2 }}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2 rounded-full cursor-pointer shadow-2xl"
            style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(8px)', border: `1px solid ${bd}` }}
            onClick={() => { setActiveFolder('inbox'); setNewMailAlert(false); }}>
            <span className="w-2 h-2 rounded-full bg-black animate-pulse flex-shrink-0" />
            <span className="text-black text-xs font-light">Nuevo correo recibido</span>
            <button onClick={e => { e.stopPropagation(); setNewMailAlert(false); }} className="text-zinc-400 hover:text-black ml-1">
              <X className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sidebar ── */}
      <aside className="hidden md:flex w-52 flex-shrink-0 flex-col border-r" style={{ background: sf, borderColor: bd }}>
        <div className="p-3 border-b" style={{ borderColor: bd }}>
          <button onClick={() => { resetCompose(); setShowCompose(true); }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-light transition-all hover:opacity-90"
            style={{ background: '#fff', color: '#000' }}>
            <Plus className="w-4 h-4" strokeWidth={1.5} /> Redactar
          </button>
        </div>

        <nav className="flex-1 py-2 px-2 space-y-0.5">
          {FOLDERS.map(item => (
            <button key={item.id} onClick={() => { setActiveFolder(item.id as Folder); setSelectedMail(null); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-light transition-all"
              style={{
                background: activeFolder === item.id ? 'rgba(255,255,255,0.07)' : 'transparent',
                color:      activeFolder === item.id ? 'white' : mt,
              }}>
              <item.icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
              <span className="flex-1 text-left truncate">{item.label}</span>
              {item.badge > 0 && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: '#fff', color: '#000' }}>
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Quick contacts */}
        <div className="p-3 border-t" style={{ borderColor: bd }}>
          <p className="text-[9px] uppercase tracking-widest font-light mb-2" style={{ color: 'rgba(255,255,255,0.2)' }}>Contactos</p>
          <div className="space-y-0.5 max-h-36 overflow-y-auto">
            {users.filter(u => u.uid !== uid).map(u => (
              <button key={u.uid} onClick={() => { setComposeTo(u); setComposeSubject(''); setComposeBody(''); setComposeAttachments([]); setEditingDraftId(null); setShowCompose(true); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl transition-all hover:bg-white/[0.04]">
                <Avatar src={u.avatar} name={u.displayName} size="sm" />
                <span className="text-xs font-light truncate" style={{ color: mt }}>{u.displayName}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Mail list ── */}
      <div className={`flex flex-col border-r ${selectedMail ? 'hidden md:flex md:w-72 flex-shrink-0' : 'flex-1'}`} style={{ borderColor: bd }}>
        {/* Toolbar */}
        <div className="h-12 flex items-center gap-2 px-3 border-b flex-shrink-0" style={{ borderColor: bd }}>
          {/* Mobile: folder name */}
          <span className="text-sm font-light text-white flex-1 truncate hidden sm:block capitalize">
            {FOLDERS.find(f => f.id === activeFolder)?.label}
          </span>
          {activeFolder === 'trash' && folderMails.length > 0 && (
            <button onClick={emptyTrash}
              className="flex items-center gap-1 text-xs font-light px-2.5 py-1 rounded-lg transition-all"
              style={{ color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)' }}>
              <Trash2 className="w-3 h-3" strokeWidth={1.5} /> Vaciar
            </button>
          )}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: mt }} strokeWidth={1.5} />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar..."
              className="pl-7 pr-3 py-1.5 rounded-xl text-xs font-light outline-none w-32"
              style={{ background: sc, border: `1px solid ${bd}`, color: 'white' }} />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-5 h-5 animate-spin" style={{ color: mt }} />
            </div>
          ) : folderMails.length === 0 ? (
            (() => { const e = emptyStates[activeFolder]; return (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                  style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${bd}` }}>
                  <e.icon className="w-5 h-5" style={{ color: mt }} strokeWidth={1} />
                </div>
                <p className="text-sm font-light text-white mb-1">{e.title}</p>
                <p className="text-xs font-light" style={{ color: mt }}>{e.sub}</p>
              </div>
            ); })()
          ) : (
            <AnimatePresence mode="popLayout">
              {folderMails.map(mail => {
                const isUnread  = mail.toUid === uid && !mail.read;
                const isSelected = selectedMail?.id === mail.id;
                const av = mail.fromUid === uid ? mail.toAvatar : mail.fromAvatar;
                const nm = mail.fromUid === uid ? mail.toName   : mail.fromName;
                return (
                  <motion.div key={mail.id}
                    initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.12 }}
                    onClick={() => { if (mail.draft) { openDraft(mail); return; } markRead(mail); }}
                    className="px-3 py-3 cursor-pointer transition-all border-b relative"
                    style={{
                      borderBottomColor: bd,
                      background:   isSelected ? 'rgba(255,255,255,0.06)' : isUnread ? 'rgba(255,255,255,0.02)' : 'transparent',
                      borderLeft:   `3px solid ${isSelected ? 'rgba(255,255,255,0.5)' : 'transparent'}`,
                    }}>
                    <div className="flex items-start gap-2.5">
                      <Avatar src={av} name={nm} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className={`text-sm truncate ${isUnread ? 'text-white font-light' : 'font-light'}`}
                            style={{ color: isUnread ? 'white' : 'rgba(255,255,255,0.6)' }}>
                            {nm}
                          </span>
                          <span className="text-[10px] font-light flex-shrink-0" style={{ color: mt }}>{formatDate(mail.createdAt)}</span>
                        </div>
                        <p className={`text-xs truncate mb-0.5 font-light ${isUnread ? 'text-white' : ''}`}
                          style={{ color: isUnread ? 'rgba(255,255,255,0.9)' : mt }}>
                          {mail.draft && <span className="text-yellow-400 mr-1">[Borrador]</span>}
                          {mail.subject || '(Sin asunto)'}
                        </p>
                        <p className="text-[11px] font-light truncate" style={{ color: 'rgba(255,255,255,0.25)' }}>
                          {mail.body?.replace(/\n/g, ' ')}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-white flex-shrink-0" />}
                          {mail.starred && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />}
                          {mail.attachments?.length > 0 && <Paperclip className="w-3 h-3" style={{ color: mt }} />}
                          {mail.forwarded && <Forward className="w-3 h-3" style={{ color: mt }} />}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* ── Detail panel ── */}
      <AnimatePresence mode="wait">
        {selectedMail ? (
          <motion.div key="detail" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            className="flex-1 flex flex-col overflow-hidden min-w-0">
            {/* Toolbar */}
            <div className="h-12 flex items-center gap-2 px-4 border-b flex-shrink-0" style={{ borderColor: bd }}>
              <button onClick={() => { setSelectedMail(null); }}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/[0.06]" style={{ color: mt }}>
                <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
              </button>
              <div className="flex-1" />
              {[
                { icon: Star, active: selectedMail.starred, fill: selectedMail.starred, color: selectedMail.starred ? '#facc15' : mt, fn: () => toggleStar(selectedMail), title: 'Destacar' },
                { icon: Reply,   active: false, fill: false, color: mt, fn: () => openReply(selectedMail),   title: 'Responder' },
                { icon: Forward, active: false, fill: false, color: mt, fn: () => openForward(selectedMail), title: 'Reenviar' },
                ...(activeFolder === 'trash' ? [{ icon: RefreshCw, active: false, fill: false, color: mt, fn: () => restoreMail(selectedMail), title: 'Restaurar' }] : []),
              ].map(({ icon: Icon, color, fn, title }, i) => (
                <button key={i} onClick={fn} title={title}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/[0.06]"
                  style={{ color }}>
                  <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              ))}
              <button onClick={() => deleteMail(selectedMail)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/10" style={{ color: mt }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#f87171'}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = mt}>
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 md:p-7">
              <h1 className="text-white text-xl font-light mb-5 leading-snug">{selectedMail.subject || '(Sin asunto)'}</h1>

              <div className="flex items-start gap-3 mb-6 pb-5 border-b" style={{ borderColor: bd }}>
                <Avatar src={selectedMail.fromAvatar} name={selectedMail.fromName} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <span className="text-white font-light text-sm">{selectedMail.fromName}</span>
                      <span className="text-xs font-light ml-2" style={{ color: mt }}>
                        {users.find(u => u.uid === selectedMail.fromUid)?.email}
                      </span>
                    </div>
                    <span className="text-[11px] font-light" style={{ color: mt }}>
                      {selectedMail.createdAt?.toDate ? format(selectedMail.createdAt.toDate(), "d 'de' MMMM 'a las' HH:mm", { locale: es }) : ''}
                    </span>
                  </div>
                  <p className="text-xs font-light mt-0.5" style={{ color: mt }}>
                    Para: <span style={{ color: 'rgba(255,255,255,0.5)' }}>{selectedMail.toName}</span>
                  </p>
                  {selectedMail.fromRole && <span className="text-[11px] font-light" style={{ color: 'rgba(255,255,255,0.2)' }}>{selectedMail.fromRole}</span>}
                </div>
              </div>

              <p className="text-sm font-light leading-relaxed whitespace-pre-wrap mb-8" style={{ color: 'rgba(255,255,255,0.75)' }}>
                {selectedMail.body}
              </p>

              {selectedMail.attachments?.length > 0 && (
                <div className="space-y-3 mb-8">
                  <p className="text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>
                    {selectedMail.attachments.length} adjunto{selectedMail.attachments.length !== 1 ? 's' : ''}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedMail.attachments.map((att, i) => (
                      <div key={i} className="rounded-2xl overflow-hidden border transition-all hover:border-zinc-700"
                        style={{ background: sc, borderColor: bd }}>
                        {att.type.startsWith('image/') ? (
                          <div className="aspect-video overflow-hidden cursor-pointer" onClick={() => { setViewerFile(att); setShowViewer(true); }}>
                            <img src={att.url} alt={att.name} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                          </div>
                        ) : (
                          <div className="aspect-video flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                            <File className="w-10 h-10" style={{ color: mt }} strokeWidth={1} />
                          </div>
                        )}
                        <div className="p-2.5 flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-light truncate text-white">{att.name}</p>
                            <p className="text-[10px] font-light" style={{ color: mt }}>{formatSize(att.size)}</p>
                          </div>
                          <div className="flex gap-1">
                            {att.type.startsWith('image/') && (
                              <button onClick={() => { setViewerFile(att); setShowViewer(true); }}
                                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/[0.06]" style={{ color: mt }}>
                                <Eye className="w-3 h-3" strokeWidth={1.5} />
                              </button>
                            )}
                            <button onClick={() => handleDownload(att)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/[0.06]" style={{ color: mt }}>
                              <Download className="w-3 h-3" strokeWidth={1.5} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t" style={{ borderColor: bd }}>
                {[
                  { icon: Reply,   label: 'Responder', fn: () => openReply(selectedMail) },
                  { icon: Forward, label: 'Reenviar',  fn: () => openForward(selectedMail) },
                ].map(({ icon: Icon, label, fn }) => (
                  <button key={label} onClick={fn}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-light transition-all hover:bg-white/[0.05] border"
                    style={{ borderColor: bd, color: mt }}>
                    <Icon className="w-3.5 h-3.5" strokeWidth={1.5} /> {label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="hidden md:flex flex-1 flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${bd}` }}>
              <Mail className="w-7 h-7" style={{ color: 'rgba(255,255,255,0.1)' }} strokeWidth={1} />
            </div>
            <p className="text-sm font-light" style={{ color: mt }}>Selecciona un correo para leerlo</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Compose Dialog ── */}
      <Dialog open={showCompose} onOpenChange={o => { if (!o) resetCompose(); setShowCompose(o); }}>
        <DialogContent className="p-0 gap-0 overflow-hidden max-w-2xl" style={{ background: sf, border: `1px solid ${bd}`, borderRadius: '20px' }}>
          <DialogHeader className="px-5 py-4 border-b" style={{ borderColor: bd }}>
            <DialogTitle className="font-light text-base text-white">{editingDraftId ? 'Editar borrador' : 'Nuevo correo'}</DialogTitle>
          </DialogHeader>

          <div className="divide-y" style={{ borderColor: bd }}>
            {/* To */}
            <div className="flex items-center gap-3 px-5 py-3" ref={userDropdownRef}>
              <span className="text-xs font-light w-14" style={{ color: mt }}>Para</span>
              {composeTo ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                  style={{ background: sc, border: `1px solid ${bd}` }}>
                  <Avatar src={composeTo.avatar} name={composeTo.displayName} size="sm" />
                  <span className="text-white text-sm font-light">{composeTo.displayName}</span>
                  <button onClick={() => setComposeTo(null)} className="ml-1 transition-colors" style={{ color: mt }}>
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="flex-1 relative">
                  <input value={userSearch} onChange={e => { setUserSearch(e.target.value); setShowUserDropdown(true); }}
                    onFocus={() => setShowUserDropdown(true)} placeholder="Buscar usuario..."
                    className="w-full bg-transparent text-white text-sm font-light outline-none placeholder:text-zinc-600" />
                  {showUserDropdown && filteredUsers.length > 0 && (
                    <div className="absolute top-full left-0 right-0 rounded-xl shadow-2xl z-50 max-h-48 overflow-y-auto mt-1 border"
                      style={{ background: sf, borderColor: bd }}>
                      {filteredUsers.map(u => (
                        <button key={u.uid} onClick={() => { setComposeTo(u); setUserSearch(''); setShowUserDropdown(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition-colors text-left">
                          <Avatar src={u.avatar} name={u.displayName} />
                          <div>
                            <p className="text-white text-sm font-light">{u.displayName}</p>
                            <p className="text-xs font-light" style={{ color: mt }}>{u.email}</p>
                          </div>
                          <span className="ml-auto text-xs font-light" style={{ color: mt }}>{u.role}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Subject */}
            <div className="flex items-center gap-3 px-5 py-3">
              <span className="text-xs font-light w-14" style={{ color: mt }}>Asunto</span>
              <input value={composeSubject} onChange={e => setComposeSubject(e.target.value)}
                placeholder="Escribe el asunto..."
                className="flex-1 bg-transparent text-white text-sm font-light outline-none placeholder:text-zinc-600" />
            </div>

            {/* Body */}
            <div className="px-5 py-4">
              <textarea value={composeBody} onChange={e => setComposeBody(e.target.value)}
                placeholder="Escribe tu mensaje aquí..." rows={10} maxLength={5000}
                className="w-full bg-transparent text-white text-sm font-light outline-none resize-none placeholder:text-zinc-700 leading-relaxed" />
              <div className="flex justify-end mt-1">
                <span className="text-xs font-light" style={{ color: composeBody.length > 4500 ? '#f87171' : 'rgba(255,255,255,0.15)' }}>
                  {composeBody.length} / 5000
                </span>
              </div>
            </div>

            {/* Attachments */}
            {composeAttachments.length > 0 && (
              <div className="px-5 py-3 flex flex-wrap gap-2">
                {composeAttachments.map((att, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl border"
                    style={{ background: sc, borderColor: bd }}>
                    {att.type.startsWith('image/') ? <Image className="w-3 h-3" style={{ color: mt }} /> : <File className="w-3 h-3" style={{ color: mt }} />}
                    <span className="text-white text-xs font-light max-w-[120px] truncate">{att.name}</span>
                    <span className="text-xs font-light" style={{ color: mt }}>{formatSize(att.size)}</span>
                    <button onClick={() => setComposeAttachments(p => p.filter((_, j) => j !== i))} style={{ color: mt }}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#f87171'}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = mt}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t" style={{ background: 'rgba(255,255,255,0.02)', borderColor: bd }}>
            <div>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => e.target.files && handleFileUpload(e.target.files)} />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploadingFiles}
                className="flex items-center gap-2 text-sm font-light px-3 py-2 rounded-xl transition-all hover:bg-white/[0.05]" style={{ color: mt }}>
                {uploadingFiles ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" strokeWidth={1.5} />}
                {uploadingFiles ? 'Subiendo...' : 'Adjuntar'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => handleSend(true)} disabled={sendingMail}
                className="px-3 py-2 rounded-xl text-sm font-light transition-all hover:bg-white/[0.05]" style={{ color: mt }}>
                Guardar borrador
              </button>
              <button onClick={() => handleSend(false)} disabled={sendingMail || !composeTo}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-light transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: '#fff', color: '#000' }}>
                {sendingMail ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Enviando...</> : <><Send className="w-3.5 h-3.5" strokeWidth={1.5} /> Enviar</>}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── File viewer ── */}
      <Dialog open={showViewer} onOpenChange={setShowViewer}>
        <DialogContent className="p-0 overflow-hidden" style={{ background: sf, border: `1px solid ${bd}`, borderRadius: '20px', maxWidth: '56rem' }}>
          {viewerFile && (
            <div className="flex flex-col" style={{ maxHeight: '90vh' }}>
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: bd }}>
                <span className="text-white font-light text-sm truncate">{viewerFile.name}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleDownload(viewerFile)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/[0.06] transition-all" style={{ color: mt }}><Download className="w-4 h-4" /></button>
                  <button onClick={() => setShowViewer(false)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/[0.06] transition-all" style={{ color: mt }}><X className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
                {viewerFile.type.startsWith('image/') && <img src={viewerFile.url} alt={viewerFile.name} className="max-w-full max-h-full object-contain rounded-xl" />}
                {viewerFile.type === 'application/pdf' && <iframe src={viewerFile.url} className="w-full border-0 rounded-xl" style={{ height: '75vh' }} title={viewerFile.name} />}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CorreoComponent;