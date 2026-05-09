import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getAnnouncements, createAnnouncement, deleteAnnouncement } from '@/lib/firebase';
import { Megaphone, Plus, Trash2, AlertCircle, Calendar, X, Pin, ChevronRight } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Announcement } from '@/types';

// ── Tokens ────────────────────────────────────────────────────────────────────
const T = {
  surface:  'hsl(var(--card))',
  border:   'hsl(var(--border))',
  muted:    'hsl(var(--muted-foreground))',
  accent:   '#a78bfa',
  danger:   '#f87171',
  input:    'hsl(var(--secondary))',
  fg:       'hsl(var(--foreground))',
};

// ── Input styles ──────────────────────────────────────────────────────────────
const inputBase: React.CSSProperties = {
  background:          T.input,
  border:              `1px solid ${T.border}`,
  color:               T.fg,
  caretColor:          T.fg,
  WebkitTextFillColor: T.fg,
  outline:             'none',
  width:               '100%',
  borderRadius:        '12px',
  padding:             '10px 14px',
  fontSize:            '14px',
  fontWeight:          300,
  transition:          'border-color 0.15s',
};

// ── CreateModal ───────────────────────────────────────────────────────────────
interface CreateModalProps {
  onClose: () => void;
  onSuccess: () => void;
  canEdit: boolean;
  createdBy: string;
}

const CreateModal: React.FC<CreateModalProps> = ({ onClose, onSuccess, canEdit, createdBy }) => {
  const [form, setForm]       = useState({ title: '', content: '', important: false });
  const [submitting, setSub]  = useState(false);
  const [error, setError]     = useState('');

  const handleSubmit = useCallback(async () => {
    if (!canEdit) return;
    if (!form.title.trim())   { setError('El título es obligatorio.'); return; }
    if (!form.content.trim()) { setError('El contenido es obligatorio.'); return; }
    setError('');
    setSub(true);
    try {
      await createAnnouncement({ ...form, createdBy });
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      setError('Error al publicar. Intenta de nuevo.');
    } finally {
      setSub(false);
    }
  }, [canEdit, form, createdBy, onSuccess, onClose]);

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{ zIndex: 9999, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(12px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg animate-in fade-in-0 zoom-in-95 duration-200"
        style={{
          background:   'hsl(var(--card))',
          border:       `1px solid rgba(255,255,255,0.08)`,
          borderRadius: '20px',
          boxShadow:    '0 40px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04)',
          overflow:     'hidden',
        }}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-5 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: `rgba(167,139,250,0.1)`, border: '1px solid rgba(167,139,250,0.18)' }}>
              <Megaphone className="w-4 h-4" style={{ color: T.accent }} strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-white font-light text-sm tracking-wide">Nuevo Anuncio</p>
              <p className="text-[10px] font-light mt-0.5" style={{ color: T.muted }}>Se publicará para todos</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/[0.08]"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Modal body */}
        <div className="px-6 py-5 space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="block text-[10px] uppercase tracking-widest font-light" style={{ color: T.muted }}>
              Título
            </label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Título del anuncio"
              style={inputBase}
              onFocus={e  => (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.22)'}
              onBlur={e   => (e.target as HTMLInputElement).style.borderColor = T.border}
            />
          </div>

          {/* Content */}
          <div className="space-y-1.5">
            <label className="block text-[10px] uppercase tracking-widest font-light" style={{ color: T.muted }}>
              Contenido
            </label>
            <textarea
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="Escribe el contenido del anuncio..."
              rows={4}
              style={{ ...inputBase, resize: 'none' }}
              onFocus={e  => (e.target as HTMLTextAreaElement).style.borderColor = 'rgba(255,255,255,0.22)'}
              onBlur={e   => (e.target as HTMLTextAreaElement).style.borderColor = T.border}
            />
          </div>

          {/* Important toggle — FIXED: no form, no double-fire */}
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, important: !f.important }))}
            className="w-full flex items-center justify-between p-4 rounded-2xl transition-all duration-200"
            style={{
              background:   form.important ? 'rgba(248,113,113,0.06)' : T.input,
              border:       form.important ? '1px solid rgba(248,113,113,0.25)' : `1px solid ${T.border}`,
              cursor:       'pointer',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
                style={{
                  background: form.important ? 'rgba(248,113,113,0.12)' : 'rgba(255,255,255,0.04)',
                  border:     form.important ? '1px solid rgba(248,113,113,0.3)' : '1px solid rgba(255,255,255,0.06)',
                }}>
                <Pin className="w-3.5 h-3.5 transition-colors"
                  style={{ color: form.important ? T.danger : 'rgba(255,255,255,0.3)' }}
                  strokeWidth={1.5} />
              </div>
              <div className="text-left">
                <p className="text-sm font-light transition-colors"
                  style={{ color: form.important ? '#fff' : 'rgba(255,255,255,0.5)' }}>
                  Marcar como importante
                </p>
                <p className="text-[11px] font-light mt-0.5" style={{ color: T.muted }}>
                  Se destacará en el dashboard y notificaciones
                </p>
              </div>
            </div>
            {/* Custom toggle indicator */}
            <div
              className="relative w-10 h-5.5 rounded-full transition-all duration-200 flex-shrink-0"
              style={{
                width:      '40px',
                height:     '22px',
                background: form.important ? 'rgba(248,113,113,0.8)' : 'rgba(255,255,255,0.08)',
                border:     form.important ? '1px solid rgba(248,113,113,0.6)' : '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <div
                className="absolute top-0.5 rounded-full transition-all duration-200"
                style={{
                  width:      '16px',
                  height:     '16px',
                  background: '#fff',
                  left:       form.important ? '20px' : '2px',
                  top:        '2px',
                  boxShadow:  '0 1px 3px rgba(0,0,0,0.4)',
                }}
              />
            </div>
          </button>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
              style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: T.danger }} strokeWidth={1.5} />
              <p className="text-xs font-light" style={{ color: T.danger }}>{error}</p>
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="px-6 pb-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-light transition-all hover:bg-white/[0.06]"
            style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`, color: 'rgba(255,255,255,0.5)' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-2 flex-1 py-2.5 rounded-xl text-sm font-light transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            style={{ background: form.important ? T.danger : '#fff', color: '#000', flex: 2 }}
          >
            {submitting ? 'Publicando...' : 'Publicar Anuncio'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ── AnnouncementCard ──────────────────────────────────────────────────────────
interface CardProps {
  a: Announcement;
  canEdit: boolean;
  onDelete: (id: string) => void;
}

const AnnouncementCard: React.FC<CardProps> = React.memo(({ a, canEdit, onDelete }) => {
  const [expanded, setExpanded]       = useState(false);
  const [confirmDel, setConfirmDel]   = useState(false);
  const isLong = a.content.length > 200;
  const preview = isLong && !expanded ? a.content.slice(0, 200) + '…' : a.content;

  return (
    <div
      className="relative rounded-2xl overflow-hidden transition-all duration-200 group"
      style={{
        background:   T.surface,
        border:       a.important ? '1px solid rgba(248,113,113,0.2)' : `1px solid ${T.border}`,
        borderLeft:   a.important ? '3px solid rgba(248,113,113,0.7)' : `3px solid transparent`,
      }}
    >
      {/* Important shimmer line */}
      {a.important && (
        <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, rgba(248,113,113,0.5) 0%, rgba(248,113,113,0.1) 60%, transparent 100%)' }} />
      )}

      <div className="p-5">
        <div className="flex items-start gap-3">

          {/* Category icon */}
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{
              background: a.important ? 'rgba(248,113,113,0.08)' : 'rgba(167,139,250,0.08)',
              border:     a.important ? '1px solid rgba(248,113,113,0.2)' : '1px solid rgba(167,139,250,0.15)',
            }}>
            <Megaphone className="w-4 h-4" strokeWidth={1.5}
              style={{ color: a.important ? T.danger : T.accent }} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
              <h3 className="text-white font-light text-sm leading-snug flex-1">{a.title}</h3>
              <div className="flex items-center gap-2 flex-shrink-0">
                {a.important && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-light px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.22)', color: T.danger }}>
                    <AlertCircle className="w-2.5 h-2.5" strokeWidth={2} />
                    Importante
                  </span>
                )}
                {canEdit && (
                  confirmDel ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onDelete(a.id)}
                        className="text-[10px] font-light px-2 py-0.5 rounded-lg transition-all"
                        style={{ background: 'rgba(248,113,113,0.15)', color: T.danger, border: '1px solid rgba(248,113,113,0.3)' }}
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDel(false)}
                        className="text-[10px] font-light px-2 py-0.5 rounded-lg transition-all"
                        style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', border: `1px solid ${T.border}` }}
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDel(true)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                      style={{ color: 'rgba(255,255,255,0.2)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = T.danger)}
                      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.2)')}
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Body */}
            <p className="text-sm font-light leading-relaxed whitespace-pre-wrap"
              style={{ color: 'rgba(255,255,255,0.55)' }}>
              {preview}
            </p>
            {isLong && (
              <button
                type="button"
                onClick={() => setExpanded(e => !e)}
                className="mt-1.5 flex items-center gap-1 text-xs font-light transition-colors"
                style={{ color: T.accent }}
              >
                {expanded ? 'Ver menos' : 'Ver más'}
                <ChevronRight className="w-3 h-3 transition-transform" strokeWidth={1.5}
                  style={{ transform: expanded ? 'rotate(270deg)' : 'rotate(90deg)' }} />
              </button>
            )}

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t"
              style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <span className="text-[11px] font-light" style={{ color: 'rgba(255,255,255,0.28)' }}>
                Por: <span style={{ color: 'rgba(255,255,255,0.45)' }}>{a.createdBy}</span>
              </span>
              <span style={{ color: 'rgba(255,255,255,0.12)' }}>·</span>
              <span className="flex items-center gap-1 text-[11px] font-light" style={{ color: 'rgba(255,255,255,0.28)' }}>
                <Calendar className="w-3 h-3" strokeWidth={1.5} />
                {format(new Date(a.createdAt), "d MMM yyyy, HH:mm", { locale: es })}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.12)' }}>·</span>
              <span className="text-[11px] font-light" style={{ color: 'rgba(255,255,255,0.22)' }}>
                {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true, locale: es })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
AnnouncementCard.displayName = 'AnnouncementCard';

// ── Main Component ────────────────────────────────────────────────────────────
const Announcements: React.FC = () => {
  const { canEdit, userProfile } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [modalOpen,     setModalOpen]     = useState(false);
  const [filter,        setFilter]        = useState<'all' | 'important'>('all');

  const load = useCallback(async () => {
    try {
      const data = await getAnnouncements();
      setAnnouncements(
        data.map((a: any) => ({
          ...a,
          createdAt: a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0),
        })) as Announcement[]
      );
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = useCallback(async (id: string) => {
    if (!canEdit) return;
    try { await deleteAnnouncement(id); load(); }
    catch (e) { console.error(e); }
  }, [canEdit, load]);

  const important = announcements.filter(a => a.important);
  const visible   = filter === 'important' ? important : announcements;

  // ── Loading ──
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
    </div>
  );

  return (
    <>
      {/* Create modal — portal to body, no form tag */}
      {modalOpen && canEdit && (
        <CreateModal
          onClose={() => setModalOpen(false)}
          onSuccess={load}
          canEdit={canEdit}
          createdBy={userProfile?.displayName || 'Administrador'}
        />
      )}

      <div className="space-y-6 animate-fade-in">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)' }}>
                <Megaphone className="w-4 h-4" style={{ color: T.accent }} strokeWidth={1.5} />
              </div>
              <h1 className="text-xl font-light text-white tracking-tight">Anuncios</h1>
            </div>
            <p className="text-sm font-light" style={{ color: T.muted }}>
              {announcements.length} publicación{announcements.length !== 1 ? 'es' : ''}
              {important.length > 0 && (
                <span className="ml-2" style={{ color: 'rgba(248,113,113,0.7)' }}>
                  · {important.length} importante{important.length !== 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter pills */}
            {important.length > 0 && (
              <div className="flex items-center p-1 rounded-xl gap-1"
                style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}` }}>
                {(['all', 'important'] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className="px-3 py-1.5 rounded-lg text-xs font-light transition-all"
                    style={{
                      background: filter === f ? 'rgba(255,255,255,0.09)' : 'transparent',
                      color:      filter === f
                        ? (f === 'important' ? T.danger : '#fff')
                        : 'rgba(255,255,255,0.35)',
                      border: filter === f ? `1px solid rgba(255,255,255,0.08)` : '1px solid transparent',
                    }}
                  >
                    {f === 'all' ? 'Todos' : '⚑ Importantes'}
                  </button>
                ))}
              </div>
            )}

            {canEdit && (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-light transition-all hover:opacity-90 active:scale-95"
                style={{ background: '#fff', color: '#000' }}
              >
                <Plus className="w-4 h-4" strokeWidth={1.5} />
                Nuevo
              </button>
            )}
          </div>
        </div>

        {/* ── Important banner (only on 'all' view) ── */}
        {filter === 'all' && important.length > 0 && (
          <div className="rounded-2xl p-4 flex items-center gap-3"
            style={{
              background: 'rgba(248,113,113,0.05)',
              border:     '1px solid rgba(248,113,113,0.18)',
            }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)' }}>
              <AlertCircle className="w-4 h-4" style={{ color: T.danger }} strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-light" style={{ color: T.danger }}>
                {important.length} anuncio{important.length !== 1 ? 's' : ''} importante{important.length !== 1 ? 's' : ''}
              </p>
              <p className="text-[11px] font-light mt-0.5" style={{ color: 'rgba(248,113,113,0.55)' }}>
                {important[0]?.title}
                {important.length > 1 && ` y ${important.length - 1} más`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFilter('important')}
              className="text-xs font-light px-3 py-1.5 rounded-lg transition-all flex-shrink-0"
              style={{ color: T.danger, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}
            >
              Ver →
            </button>
          </div>
        )}

        {/* ── List ── */}
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-2xl border-2 border-dashed"
            style={{ borderColor: T.border }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}` }}>
              <Megaphone className="w-5 h-5" style={{ color: T.muted }} strokeWidth={1} />
            </div>
            <p className="text-sm font-light" style={{ color: T.muted }}>
              {filter === 'important' ? 'No hay anuncios importantes' : 'No hay anuncios publicados'}
            </p>
            {filter === 'important' && (
              <button type="button" onClick={() => setFilter('all')}
                className="mt-3 text-xs font-light underline" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Ver todos
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map(a => (
              <AnnouncementCard key={a.id} a={a} canEdit={canEdit} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default Announcements;