import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '@/lib/firebase';
import {
  collection, addDoc, deleteDoc, doc, onSnapshot,
  query, orderBy, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { uploadMediaFile, deleteMediaFile } from '@/lib/supabaseclient';
import { useAuth } from '@/contexts/AuthContext';
import type { MediaFile, MediaType } from '@/types';
import {
  Upload, Trash2, Search, Image, Film, FileText, File,
  Download, Tag, Grid3X3, List, X, Check, AlertCircle,
  Eye,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getMimeType(mimeType: string): MediaType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) return 'document';
  return 'other';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const TYPE_ICON: Record<MediaType, React.FC<any>> = {
  image: Image, video: Film, document: FileText, other: File,
};
const TYPE_COLOR: Record<MediaType, string> = {
  image: '#a78bfa', video: '#60a5fa', document: '#34d399', other: '#9ca3af',
};
const TYPE_LABEL: Record<MediaType, string> = {
  image: 'Imágenes', video: 'Videos', document: 'Documentos', other: 'Otros',
};

const ACCEPTED = 'image/*,video/*,.pdf,.doc,.docx,.txt,.svg,.figma';
const MAX_SIZE_MB = 50;

type ViewMode = 'grid' | 'list';
type FilterType = 'all' | MediaType;
type Toast = { type: 'success' | 'error'; msg: string } | null;

interface PreviewFile extends MediaFile { }

export default function PanelDiseno() {
  const { currentUser, userProfile } = useAuth();
  const [files,       setFiles]       = useState<MediaFile[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [uploading,   setUploading]   = useState(false);
  const [uploadPct,   setUploadPct]   = useState(0);
  const [deleting,    setDeleting]    = useState<string | null>(null);
  const [viewMode,    setViewMode]    = useState<ViewMode>('grid');
  const [filterType,  setFilterType]  = useState<FilterType>('all');
  const [search,      setSearch]      = useState('');
  const [toast,       setToast]       = useState<Toast>(null);
  const [preview,     setPreview]     = useState<PreviewFile | null>(null);
  const [tagInput,    setTagInput]    = useState('');
  const [editingTags, setEditingTags] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Cargar archivos desde Firestore ─────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'diseno_media'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d => {
        const data = d.data();
        return {
          ...data,
          id: d.id,
          createdAt: data.createdAt?.toDate?.() ?? new Date(),
        } as MediaFile;
      });
      setFiles(docs);
      setLoading(false);
    }, err => {
      console.error('Error cargando archivos:', err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Subir archivo ────────────────────────────────────────────────────────
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser || !userProfile) return;

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      showToast('error', `El archivo supera el límite de ${MAX_SIZE_MB}MB`);
      return;
    }

    setUploading(true);
    setUploadPct(10);

    try {
      // Simular progreso mientras sube
      const progressInterval = setInterval(() => {
        setUploadPct(p => Math.min(p + 15, 85));
      }, 300);

      const result = await uploadMediaFile(file, currentUser.uid);
      clearInterval(progressInterval);
      setUploadPct(95);

      const mediaType = getMimeType(file.type);

      await addDoc(collection(db, 'diseno_media'), {
        name:         file.name,
        originalName: file.name,
        url:          result.url,
        path:         result.path,
        type:         mediaType,
        mimeType:     file.type,
        size:         file.size,
        uploadedBy:   currentUser.uid,
        uploaderName: userProfile.displayName,
        tags:         [],
        description:  '',
        createdAt:    serverTimestamp(),
      });

      setUploadPct(100);
      setTimeout(() => { setUploading(false); setUploadPct(0); }, 600);
      showToast('success', `"${file.name}" subido correctamente`);
    } catch (err: any) {
      setUploading(false);
      setUploadPct(0);
      showToast('error', `Error al subir: ${err.message}`);
    }

    // Reset input
    if (fileRef.current) fileRef.current.value = '';
  };

  // ── Eliminar archivo ─────────────────────────────────────────────────────
  const handleDelete = async (file: MediaFile) => {
    if (!window.confirm(`¿Eliminar "${file.name}"? Esta acción no se puede deshacer.`)) return;
    setDeleting(file.id);
    try {
      await deleteMediaFile(file.path);
      await deleteDoc(doc(db, 'diseno_media', file.id));
      showToast('success', 'Archivo eliminado');
      if (preview?.id === file.id) setPreview(null);
    } catch (err: any) {
      showToast('error', `Error al eliminar: ${err.message}`);
    } finally {
      setDeleting(null);
    }
  };

  // ── Guardar tags ─────────────────────────────────────────────────────────
  const handleSaveTags = async (fileId: string, tags: string[]) => {
    try {
      await updateDoc(doc(db, 'diseno_media', fileId), { tags });
      setEditingTags(null);
      showToast('success', 'Etiquetas actualizadas');
    } catch (err: any) {
      showToast('error', `Error guardando etiquetas: ${err.message}`);
    }
  };

  // ── Filtrado ─────────────────────────────────────────────────────────────
  const filtered = files.filter(f => {
    const matchType = filterType === 'all' || f.type === filterType;
    const matchSearch = !search ||
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.uploaderName?.toLowerCase().includes(search.toLowerCase()) ||
      f.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()));
    return matchType && matchSearch;
  });

  const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);
  const countByType = (['image', 'video', 'document', 'other'] as MediaType[]).reduce((acc, t) => {
    acc[t] = files.filter(f => f.type === t).length;
    return acc;
  }, {} as Record<MediaType, number>);

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed top-20 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl border text-sm font-light shadow-2xl"
          style={{
            background: toast.type === 'success' ? 'rgba(20,30,20,0.97)' : 'rgba(30,15,15,0.97)',
            borderColor: toast.type === 'success' ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)',
            color: toast.type === 'success' ? '#34d399' : '#f87171',
          }}>
          {toast.type === 'success'
            ? <Check className="w-4 h-4" strokeWidth={1.5} />
            : <AlertCircle className="w-4 h-4" strokeWidth={1.5} />}
          {toast.msg}
        </div>
      )}

      {/* ── Preview Modal ── */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(20px)' }}
          onClick={() => setPreview(null)}>
          <div className="relative max-w-4xl w-full rounded-3xl overflow-hidden"
            style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={e => e.stopPropagation()}>
            {/* Close */}
            <button onClick={() => setPreview(null)}
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-xl bg-black/80 flex items-center justify-center text-zinc-400 hover:text-white">
              <X className="w-4 h-4" strokeWidth={1.5} />
            </button>
            {/* Content */}
            {preview.type === 'image' && (
              <img src={preview.url} alt={preview.name} className="w-full max-h-[70vh] object-contain" />
            )}
            {preview.type === 'video' && (
              <video src={preview.url} controls className="w-full max-h-[70vh]" />
            )}
            {(preview.type === 'document' || preview.type === 'other') && (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <FileText className="w-16 h-16 text-zinc-700 mx-auto mb-4" strokeWidth={1} />
                  <p className="text-white text-sm font-light mb-2">{preview.name}</p>
                  <a href={preview.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black text-sm font-light">
                    <Download className="w-4 h-4" strokeWidth={1.5} />
                    Abrir archivo
                  </a>
                </div>
              </div>
            )}
            {/* Info */}
            <div className="px-6 py-4 border-t border-zinc-900">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-white text-sm font-light mb-1">{preview.name}</p>
                  <p className="text-zinc-500 text-xs font-light">
                    {formatBytes(preview.size)} · Subido por {preview.uploaderName} ·{' '}
                    {format(preview.createdAt, 'dd MMM yyyy, HH:mm', { locale: es })}
                  </p>
                  {(preview.tags ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {(preview.tags ?? []).map(tag => (
                        <span key={tag} className="px-2 py-0.5 rounded-lg text-xs font-light text-zinc-400"
                          style={{ background: 'rgba(255,255,255,0.06)' }}>#{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <a href={preview.url} download={preview.name}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-light text-zinc-400 hover:text-white transition-colors flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <Download className="w-4 h-4" strokeWidth={1.5} />
                  Descargar
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-white text-xl font-light tracking-wide mb-1">Panel de Diseño</h1>
          <p className="text-zinc-500 text-sm font-light">
            {files.length} archivos · {formatBytes(totalSize)} utilizados
          </p>
        </div>
        <div>
          <input ref={fileRef} type="file" accept={ACCEPTED} onChange={handleUpload} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-light transition-all"
            style={{
              background: uploading ? 'rgba(255,255,255,0.04)' : '#fff',
              color: uploading ? '#555' : '#000',
              cursor: uploading ? 'not-allowed' : 'pointer',
            }}>
            <Upload className="w-4 h-4" strokeWidth={1.5} />
            {uploading ? `Subiendo... ${uploadPct}%` : 'Subir archivo'}
          </button>
        </div>
      </div>

      {/* Progress bar de upload */}
      {uploading && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="h-1.5 bg-zinc-900">
            <div className="h-full bg-white transition-all duration-300 rounded-full" style={{ width: `${uploadPct}%` }} />
          </div>
          <p className="text-zinc-500 text-xs font-light px-4 py-2">Subiendo archivo al servidor...</p>
        </div>
      )}

      {/* ── Stats por tipo ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['image', 'video', 'document', 'other'] as MediaType[]).map(type => {
          const Icon  = TYPE_ICON[type];
          const color = TYPE_COLOR[type];
          return (
            <button key={type}
              onClick={() => setFilterType(filterType === type ? 'all' : type)}
              className="rounded-2xl p-4 text-left transition-all"
              style={{
                background: filterType === type ? `${color}12` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${filterType === type ? color + '40' : 'rgba(255,255,255,0.06)'}`,
              }}>
              <Icon className="w-5 h-5 mb-2" style={{ color }} strokeWidth={1.5} />
              <p className="text-white text-lg font-light">{countByType[type]}</p>
              <p className="text-xs font-light mt-0.5" style={{ color }}>{TYPE_LABEL[type]}</p>
            </button>
          );
        })}
      </div>

      {/* ── Controles ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 relative min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" strokeWidth={1.5} />
          <input
            type="text"
            placeholder="Buscar por nombre, subidor o etiqueta..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl text-sm font-light text-white placeholder-zinc-600 outline-none"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          />
        </div>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={() => setViewMode('grid')}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
            style={{ background: viewMode === 'grid' ? 'rgba(255,255,255,0.1)' : 'transparent', color: viewMode === 'grid' ? '#fff' : '#555' }}>
            <Grid3X3 className="w-4 h-4" strokeWidth={1.5} />
          </button>
          <button onClick={() => setViewMode('list')}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
            style={{ background: viewMode === 'list' ? 'rgba(255,255,255,0.1)' : 'transparent', color: viewMode === 'list' ? '#fff' : '#555' }}>
            <List className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* ── Galería ── */}
      {loading ? (
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center rounded-3xl" style={{ border: '1px dashed rgba(255,255,255,0.1)' }}>
          <Image className="w-10 h-10 text-zinc-800 mx-auto mb-4" strokeWidth={1} />
          <p className="text-zinc-500 text-sm font-light mb-1">Sin archivos</p>
          <p className="text-zinc-700 text-xs font-light">Sube imágenes, videos o documentos para empezar</p>
        </div>
      ) : viewMode === 'grid' ? (
        // ── GRID VIEW ──
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(file => {
            const Icon  = TYPE_ICON[file.type];
            const color = TYPE_COLOR[file.type];
            const isDeleting = deleting === file.id;
            return (
              <div key={file.id} className="group relative rounded-2xl overflow-hidden transition-all"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {/* Thumbnail */}
                <div className="aspect-square flex items-center justify-center cursor-pointer"
                  onClick={() => setPreview(file)}>
                  {file.type === 'image' ? (
                    <img src={file.url} alt={file.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : file.type === 'video' ? (
                    <div className="relative w-full h-full">
                      <video src={file.url} className="w-full h-full object-cover" muted />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Film className="w-8 h-8 text-white/60" strokeWidth={1.5} />
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"
                      style={{ background: `${color}10` }}>
                      <Icon className="w-12 h-12" style={{ color }} strokeWidth={1} />
                    </div>
                  )}
                </div>

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button onClick={() => setPreview(file)}
                    className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all">
                    <Eye className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                  <a href={file.url} download={file.name}
                    className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all">
                    <Download className="w-4 h-4" strokeWidth={1.5} />
                  </a>
                  <button onClick={() => handleDelete(file)} disabled={isDeleting}
                    className="w-9 h-9 rounded-xl bg-red-900/40 hover:bg-red-900/70 flex items-center justify-center text-red-400 transition-all">
                    {isDeleting
                      ? <div className="w-4 h-4 border border-red-600 border-t-transparent rounded-full animate-spin" />
                      : <Trash2 className="w-4 h-4" strokeWidth={1.5} />}
                  </button>
                </div>

                {/* Info */}
                <div className="p-3">
                  <p className="text-white text-xs font-light truncate mb-1">{file.name}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-light" style={{ color }}>{formatBytes(file.size)}</span>
                    <span className="text-zinc-700 text-[10px] font-light">
                      {format(file.createdAt, 'dd/MM/yy', { locale: es })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // ── LIST VIEW ──
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="divide-y divide-zinc-900/60">
            {filtered.map(file => {
              const Icon  = TYPE_ICON[file.type];
              const color = TYPE_COLOR[file.type];
              const isDeleting = deleting === file.id;
              const isEditingThis = editingTags === file.id;
              return (
                <div key={file.id} className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.015] transition-colors">
                  {/* Icon/thumb */}
                  <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0"
                    style={{ background: `${color}12` }}>
                    {file.type === 'image' ? (
                      <img src={file.url} alt={file.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <Icon className="w-5 h-5" style={{ color }} strokeWidth={1.5} />
                    )}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-light truncate">{file.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-zinc-600 text-xs font-light">{formatBytes(file.size)}</span>
                      <span className="text-zinc-700 text-xs font-light">·</span>
                      <span className="text-zinc-600 text-xs font-light">{file.uploaderName}</span>
                      <span className="text-zinc-700 text-xs font-light">·</span>
                      <span className="text-zinc-700 text-xs font-light">
                        {format(file.createdAt, 'dd MMM yyyy', { locale: es })}
                      </span>
                    </div>
                    {/* Tags */}
                    {isEditingThis ? (
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          autoFocus
                          value={tagInput}
                          onChange={e => setTagInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean);
                              handleSaveTags(file.id, tags);
                            }
                            if (e.key === 'Escape') setEditingTags(null);
                          }}
                          placeholder="tag1, tag2, tag3 (Enter para guardar)"
                          className="flex-1 px-3 py-1.5 rounded-xl text-xs font-light text-white placeholder-zinc-600 outline-none"
                          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                        />
                        <button onClick={() => {
                          const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean);
                          handleSaveTags(file.id, tags);
                        }} className="text-emerald-500 hover:text-emerald-400">
                          <Check className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                      </div>
                    ) : (
                      (file.tags ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {(file.tags ?? []).map(tag => (
                            <span key={tag} className="px-2 py-0.5 rounded-lg text-[10px] font-light text-zinc-500"
                              style={{ background: 'rgba(255,255,255,0.04)' }}>
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )
                    )}
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => {
                      setEditingTags(file.id);
                      setTagInput(file.tags?.join(', ') ?? '');
                    }} className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-600 hover:text-zinc-300 transition-colors"
                      style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <Tag className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    <button onClick={() => setPreview(file)}
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-600 hover:text-zinc-300 transition-colors"
                      style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    <a href={file.url} download={file.name}
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-600 hover:text-zinc-300 transition-colors"
                      style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </a>
                    <button onClick={() => handleDelete(file)} disabled={isDeleting}
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-700 hover:text-red-400 transition-colors"
                      style={{ background: 'rgba(255,255,255,0.03)' }}>
                      {isDeleting
                        ? <div className="w-3.5 h-3.5 border border-red-700 border-t-transparent rounded-full animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer info */}
      <p className="text-center text-zinc-700 text-xs font-light">
        Archivos aceptados: imágenes, videos, PDF, documentos · Máximo {MAX_SIZE_MB}MB por archivo
      </p>
    </div>
  );
}