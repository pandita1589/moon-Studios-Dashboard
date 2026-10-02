/**
 * TaskReportDialog.tsx
 * Dialog para que Empleados y Administración reporten el estado de una tarea.
 * - Selección de estado: Completado / No Completada / En Desarrollo
 * - Campo de comentario (siempre)
 * - Campo de razón (obligatorio si "No Completada")
 * - Subida de archivos/capturas a Supabase (hasta 5 archivos, 10 MB c/u)
 * - Soporte edición del propio reporte previo
 */

import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label }  from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  CheckCircle2, XCircle, Loader2, Upload, Trash2,
  FileImage, FileText, File, AlertCircle, Clock
} from 'lucide-react';
import { uploadReportFile, deleteReportFile } from '@/lib/supabaseclient';
import {
  createTaskReport, updateTaskReport, getMyReport,
  type TaskReport, type ReportStatus, type Attachment,
} from '@/lib/taskReports';
import type { Task, UserProfile } from '@/types';

// ── Configuración de estados ──────────────────────────────────────────────────

const STATUS_OPTIONS: { value: ReportStatus; label: string; icon: React.ReactNode; color: string; bg: string; border: string }[] = [
  {
    value: 'completed',
    label: 'Completado',
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: 'text-green-400',
    bg:    'bg-green-950/60',
    border:'border-green-700',
  },
  {
    value: 'in-progress',
    label: 'En Desarrollo',
    icon: <Clock className="w-4 h-4" />,
    color: 'text-blue-400',
    bg:    'bg-blue-950/60',
    border:'border-blue-700',
  },
  {
    value: 'not-completed',
    label: 'No Completada',
    icon: <XCircle className="w-4 h-4" />,
    color: 'text-red-400',
    bg:    'bg-red-950/60',
    border:'border-red-700',
  },
];

const MAX_FILES    = 5;
const MAX_FILE_MB  = 10;
const MAX_FILE_B   = MAX_FILE_MB * 1024 * 1024;
const ALLOWED_TYPES = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/pdf',
  'video/mp4', 'video/webm',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return <FileImage className="w-4 h-4 text-zinc-400" />;
  if (mime === 'application/pdf') return <FileText  className="w-4 h-4 text-red-400"  />;
  return <File className="w-4 h-4 text-zinc-400" />;
}

function msgError(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? '');
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface TaskReportDialogProps {
  open:        boolean;
  onClose:     () => void;
  task:        Task;
  userProfile: UserProfile;
}

// ── Componente ────────────────────────────────────────────────────────────────

const TaskReportDialog: React.FC<TaskReportDialogProps> = ({
  open, onClose, task, userProfile,
}) => {
  const [reportStatus, setReportStatus] = useState<ReportStatus>('in-progress');
  const [comment,      setComment]      = useState('');
  const [reason,       setReason]       = useState('');
  const [attachments,  setAttachments]  = useState<Attachment[]>([]);
  const [uploading,    setUploading]    = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [existingReport, setExisting]   = useState<TaskReport | null>(null);
  // Para qué tarea/usuario ya se cargó el reporte previo; mientras no coincida, se está cargando.
  const [cargadoPara,  setCargadoPara]  = useState<string | null>(null);
  const [loadError,    setLoadError]    = useState<string | null>(null);
  const [reintento,    setReintento]    = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Archivos subidos en esta sesión del diálogo que todavía no están en un
  // reporte guardado: si se cancela, se borran para no dejar huérfanos.
  const subidosSesion = useRef<Set<string>>(new Set());
  // Adjuntos ya guardados que el usuario quitó: se borran del almacenamiento
  // solo cuando el reporte se guarda (si cancela, el reporte los sigue usando).
  const quitadosGuardados = useRef<Set<string>>(new Set());
  // Cambia en cada cierre: una subida que termina con el diálogo ya cerrado se descarta.
  const sesion = useRef(0);

  const clave = `${task.id}|${userProfile.uid}`;
  const cargando = open && cargadoPara !== clave && !loadError;

  const descartarSubidas = () => {
    const urls = [...subidosSesion.current];
    subidosSesion.current.clear();
    quitadosGuardados.current.clear();
    urls.forEach(url => { deleteReportFile(url).catch(console.error); });
  };

  // Si el diálogo se desmonta sin guardar (el Calendario lo quita al cerrar), limpia lo subido.
  // El Set y el ref son siempre los mismos objetos: se capturan para usarlos en la limpieza.
  useEffect(() => {
    const subidos = subidosSesion.current;
    const ses = sesion;
    return () => {
      ses.current++;
      const urls = [...subidos];
      subidos.clear();
      urls.forEach(url => { deleteReportFile(url).catch(console.error); });
    };
  }, []);

  // Cargar reporte previo del usuario
  useEffect(() => {
    if (!open) return;
    let vigente = true;
    getMyReport(task.id, userProfile.uid)
      .then(rep => {
        if (!vigente) return;
        setError(null);
        setLoadError(null);
        setExisting(rep);
        setReportStatus(rep?.reportStatus ?? 'in-progress');
        setComment(rep?.comment ?? '');
        setReason(rep?.reason ?? '');
        setAttachments(rep?.attachments ?? []);
        setCargadoPara(`${task.id}|${userProfile.uid}`);
      })
      .catch(err => {
        if (!vigente) return;
        console.error('Error cargando el reporte previo:', err);
        // Sin saber si ya hay un reporte no se deja enviar: se duplicaría.
        setLoadError('No se pudo cargar tu reporte anterior. Revisa tu conexión e inténtalo de nuevo.');
      });
    return () => { vigente = false; };
  }, [open, task.id, userProfile.uid, reintento]);

  const handleClose = () => {
    if (saving) return;
    sesion.current++;
    descartarSubidas();
    setCargadoPara(null);
    setLoadError(null);
    setError(null);
    onClose();
  };

  // ── Subida de archivos ───────────────────────────────────────────────────────

  const handleFiles = async (files: FileList | null) => {
    if (!files || uploading) return;
    const arr = Array.from(files);
    // Se limpia para que volver a elegir el mismo archivo dispare onChange.
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Validaciones
    if (attachments.length + arr.length > MAX_FILES) {
      setError(`Máximo ${MAX_FILES} archivos por reporte.`);
      return;
    }
    const invalid = arr.filter(f => !ALLOWED_TYPES.includes(f.type) || f.size > MAX_FILE_B);
    if (invalid.length) {
      setError(`Algunos archivos son inválidos (tipo no permitido o > ${MAX_FILE_MB} MB).`);
      return;
    }
    setError(null);
    setUploading(true);
    const miSesion = sesion.current;
    try {
      // allSettled: si uno falla, los que sí subieron no se pierden (ni quedan huérfanos).
      const results = await Promise.allSettled(arr.map(f => uploadReportFile(f, task.id, userProfile.uid)));
      const ok = results.flatMap(r => (r.status === 'fulfilled' ? [r.value] : []));
      if (miSesion !== sesion.current) {
        ok.forEach(a => { deleteReportFile(a.url).catch(console.error); });
        return;
      }
      ok.forEach(a => subidosSesion.current.add(a.url));
      setAttachments(prev => [...prev, ...ok]);
      const fallidos = results.filter(r => r.status === 'rejected');
      if (fallidos.length) {
        const r = fallidos[0] as PromiseRejectedResult;
        setError(`${fallidos.length} archivo(s) no se pudieron subir: ${msgError(r.reason)}`);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAttachment = (att: Attachment) => {
    setAttachments(prev => prev.filter(a => a.url !== att.url));
    if (subidosSesion.current.has(att.url)) {
      // Subido en esta sesión y nunca guardado: nadie más lo usa, se borra ya.
      subidosSesion.current.delete(att.url);
      deleteReportFile(att.url).catch(console.error);
    } else {
      quitadosGuardados.current.add(att.url);
    }
  };

  // ── Guardar reporte ──────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cargando || loadError) return;
    if (reportStatus === 'not-completed' && !reason.trim()) {
      setError('Debes indicar la razón por la que no fue completada.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = {
        taskId:       task.id,
        taskTitle:    task.title,
        reportedBy:   userProfile.uid,
        reporterName: userProfile.displayName ?? 'Usuario',
        reporterRole: userProfile.role,
        reportStatus,
        comment:      comment.trim(),
        reason:       reportStatus === 'not-completed' ? reason.trim() : '',
        attachments,
      };
      if (existingReport) {
        await updateTaskReport(existingReport.id, payload);
      } else {
        await createTaskReport(payload);
      }
      // Ya guardado: lo subido pasa a ser del reporte y lo quitado ya no se usa.
      const aBorrar = [...quitadosGuardados.current];
      subidosSesion.current.clear();
      quitadosGuardados.current.clear();
      aBorrar.forEach(url => { deleteReportFile(url).catch(console.error); });
      sesion.current++;
      setCargadoPara(null);
      onClose();
    } catch (e) {
      setError(msgError(e) || 'Error al guardar el reporte.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="bg-zinc-950 border-zinc-800 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white font-extralight flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-zinc-400" />
            {existingReport ? 'Actualizar reporte' : 'Reportar tarea'}
          </DialogTitle>
          <p className="text-zinc-500 text-xs font-extralight truncate mt-0.5">
            {task.title}
          </p>
        </DialogHeader>

        {cargando ? (
          <div className="flex items-center justify-center gap-2 py-10 text-zinc-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs font-extralight">Cargando reporte…</span>
          </div>
        ) : loadError ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 bg-red-950/40 border border-red-900 rounded-md">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-xs font-extralight">{loadError}</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={handleClose}
                className="flex-1 text-zinc-500 hover:text-white font-extralight">
                Cerrar
              </Button>
              <Button type="button" onClick={() => { setLoadError(null); setReintento(n => n + 1); }}
                className="flex-1 bg-white text-black hover:bg-zinc-200 font-extralight">
                Reintentar
              </Button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">

          {/* ── Estado ── */}
          <div className="space-y-2">
            <Label className="text-zinc-500 font-extralight text-xs uppercase tracking-wider">
              Estado de la tarea *
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {STATUS_OPTIONS.map(opt => {
                const sel = reportStatus === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setReportStatus(opt.value); setError(null); }}
                    className={`flex flex-col items-center gap-2 py-3 px-2 rounded-lg border-2 transition-all duration-150 text-center
                      ${sel ? `${opt.bg} ${opt.border} ${opt.color}` : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
                  >
                    {opt.icon}
                    <span className="text-xs font-extralight leading-tight">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Razón (solo si No Completada) ── */}
          {reportStatus === 'not-completed' && (
            <div className="space-y-2">
              <Label className="text-zinc-500 font-extralight text-xs uppercase tracking-wider">
                Razón de no completar *
              </Label>
              <Textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Explica qué impidió completar la tarea..."
                rows={2}
                className="bg-zinc-900 border-zinc-800 text-white font-extralight text-sm resize-none focus:border-zinc-600"
              />
            </div>
          )}

          {/* ── Comentario ── */}
          <div className="space-y-2">
            <Label className="text-zinc-500 font-extralight text-xs uppercase tracking-wider">
              Comentario / Avance
            </Label>
            <Textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Describe el avance, lo que hiciste, notas relevantes..."
              rows={3}
              className="bg-zinc-900 border-zinc-800 text-white font-extralight text-sm resize-none focus:border-zinc-600"
            />
          </div>

          {/* ── Adjuntos ── */}
          <div className="space-y-2">
            <Label className="text-zinc-500 font-extralight text-xs uppercase tracking-wider">
              Capturas / Archivos ({attachments.length}/{MAX_FILES})
            </Label>

            {/* Drop zone */}
            <div
              className="relative border border-dashed border-zinc-700 rounded-lg p-4 hover:border-zinc-500 transition-colors cursor-pointer text-center"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); void handleFiles(e.dataTransfer.files); }}
            >
              {uploading ? (
                <div className="flex items-center justify-center gap-2 text-zinc-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs font-extralight">Subiendo...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-zinc-600">
                  <Upload className="w-5 h-5" />
                  <p className="text-xs font-extralight">
                    Haz clic o arrastra archivos aquí
                  </p>
                  <p className="text-xs font-extralight text-zinc-700">
                    PNG, JPG, GIF, PDF, MP4 — máx {MAX_FILE_MB} MB c/u
                  </p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ALLOWED_TYPES.join(',')}
                className="hidden"
                onChange={e => { void handleFiles(e.target.files); }}
              />
            </div>

            {/* Lista de adjuntos */}
            {attachments.length > 0 && (
              <div className="space-y-1.5">
                {attachments.map(att => (
                  <div key={att.url} className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-md group">
                    {fileIcon(att.type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-zinc-300 text-xs font-extralight truncate">{att.name}</p>
                      <p className="text-zinc-600 text-xs font-extralight">{formatBytes(att.size)}</p>
                    </div>
                    {att.type.startsWith('image/') && (
                      <a href={att.url} target="_blank" rel="noreferrer"
                        className="text-zinc-600 hover:text-zinc-400 text-xs font-extralight transition-colors">
                        Ver
                      </a>
                    )}
                    {/* Visible siempre en táctil; con mouse aparece al pasar por encima o con el foco */}
                    <button type="button" onClick={() => handleRemoveAttachment(att)} aria-label={`Quitar ${att.name}`}
                      className="text-zinc-700 hover:text-red-400 transition-colors [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Error ── */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-950/40 border border-red-900 rounded-md">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-xs font-extralight">{error}</p>
            </div>
          )}

          {/* ── Acciones ── */}
          <div className="flex gap-2 pt-2 border-t border-zinc-800">
            <Button type="button" variant="ghost" onClick={handleClose} disabled={saving}
              className="flex-1 text-zinc-500 hover:text-white font-extralight">
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || uploading}
              className="flex-1 bg-white text-black hover:bg-zinc-200 font-extralight">
              {saving
                ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Guardando...</>
                : existingReport ? 'Actualizar reporte' : 'Enviar reporte'
              }
            </Button>
          </div>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TaskReportDialog;
