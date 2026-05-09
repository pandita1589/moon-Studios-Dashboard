/**
 * EmployeeContractModal.tsx
 * Solo permite 1 contrato por empleado — bloqueado después de subir
 */
import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  FileText, Upload, Trash2, Download, Eye,
  Loader2, AlertCircle, CheckCircle, X, ArrowLeft, Lock
} from 'lucide-react';
import { supabase } from '@/lib/supabaseclient';
import type { UserProfile } from '@/types';

const CONTRACTS_BUCKET = 'employee-contracts';
const MAX_MB = 20;
const ALLOWED = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

interface ContractFile {
  name: string;
  path: string;
  url: string;
  size: number;
  createdAt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  user: UserProfile | null;
}

const EmployeeContractModal: React.FC<Props> = ({ open, onClose, user }) => {
  const [contracts,  setContracts]  = useState<ContractFile[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [deleting,   setDeleting]   = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [dragging,   setDragging]   = useState(false);
  const [viewerFile, setViewerFile] = useState<ContractFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── ¿Ya hay un contrato subido? ── */
  const hasContract = contracts.length > 0;

  const fetchContracts = async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
      const { data, error: listErr } = await supabase.storage
        .from(CONTRACTS_BUCKET)
        .list(user.uid, { limit: 10, sortBy: { column: 'created_at', order: 'desc' } });
      if (listErr) throw listErr;
      const files: ContractFile[] = (data ?? [])
        .filter(f => f.name !== '.emptyFolderPlaceholder')
        .map(f => {
          const path = `${user.uid}/${f.name}`;
          const { data: pub } = supabase.storage.from(CONTRACTS_BUCKET).getPublicUrl(path);
          return { name: f.name, path, url: pub.publicUrl, size: f.metadata?.size ?? 0, createdAt: f.created_at ?? '' };
        });
      setContracts(files);
    } catch (e: any) {
      setError('Error al cargar: ' + (e.message ?? e));
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (open && user) fetchContracts();
    if (!open) { setContracts([]); setError(null); setSuccessMsg(null); setViewerFile(null); }
  }, [open, user]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || !user) return;
    if (hasContract) { setError('Ya existe un contrato. Elimínalo primero para subir uno nuevo.'); return; }
    const file = files[0];
    if (!ALLOWED.includes(file.type)) { setError('Solo PDF o Word (.pdf, .doc, .docx).'); return; }
    if (file.size > MAX_MB * 1024 * 1024) { setError(`Máximo ${MAX_MB} MB.`); return; }
    setError(null); setSuccessMsg(null); setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'pdf';
const filename = `${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(CONTRACTS_BUCKET)
        .upload(`${user.uid}/${filename}`, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      setSuccessMsg(`"${file.name}" subido correctamente.`);
      setTimeout(() => setSuccessMsg(null), 3000);
      fetchContracts();
    } catch (e: any) {
      setError('Error al subir: ' + (e.message ?? e));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (path: string, name: string) => {
    if (!confirm(`¿Eliminar "${cleanName(name)}"? Podrás subir un nuevo contrato después.`)) return;
    setDeleting(path);
    try {
      const { error: delErr } = await supabase.storage.from(CONTRACTS_BUCKET).remove([path]);
      if (delErr) throw delErr;
      if (viewerFile?.path === path) setViewerFile(null);
      fetchContracts();
    } catch (e: any) {
      setError('Error al eliminar: ' + (e.message ?? e));
    } finally { setDeleting(null); }
  };

  const handleDownload = async (url: string, name: string) => {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(a.href);
  };

  const fmtBytes = (b: number) =>
    b < 1024 ? `${b} B` : b < 1024**2 ? `${(b/1024).toFixed(1)} KB` : `${(b/1024**2).toFixed(1)} MB`;

  const fmtDate = (iso: string) =>
    iso ? new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const isPDF  = (name: string) => name.toLowerCase().endsWith('.pdf');
  const cleanName = (name: string) => name.replace(/^\d+_/, '');

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="bg-zinc-950 border-zinc-800 text-white max-w-6xl w-full overflow-hidden flex flex-col p-0 gap-0 [&>button]:hidden"
        style={{ height: viewerFile ? '90vh' : 'auto', maxHeight: '90vh', maxWidth: viewerFile ? '85vw' : '42rem', width: '100%' }}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            {viewerFile && (
              <button onClick={() => setViewerFile(null)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <FileText className="w-4 h-4 text-zinc-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-white font-extralight text-sm truncate">
                {viewerFile ? cleanName(viewerFile.name) : `Contratos — ${user.displayName}`}
              </p>
              {!viewerFile && (
                <p className="text-zinc-600 text-xs font-extralight flex items-center gap-1.5">
                  {hasContract
                    ? <><Lock className="w-2.5 h-2.5 text-amber-500" /><span className="text-amber-600">Contrato cargado — subida bloqueada</span></>
                    : 'Sin contrato — puedes subir uno'
                  }
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {viewerFile && (
              <Button variant="outline" size="sm"
                onClick={() => handleDownload(viewerFile.url, cleanName(viewerFile.name))}
                className="border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 font-extralight text-xs h-7">
                <Download className="w-3 h-3 mr-1" /> Descargar
              </Button>
            )}
            <button onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── VISOR PDF INLINE ── */}
        {viewerFile ? (
          <div className="flex-1 overflow-hidden flex flex-col">
            {isPDF(viewerFile.name) ? (
              <iframe src={viewerFile.url} className="flex-1 border-0 w-full"
  style={{ minHeight: '700px', minWidth: '700px', background: '#fff' }} title={cleanName(viewerFile.name)} />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-zinc-500 p-10">
                <FileText className="w-14 h-14 text-zinc-700" strokeWidth={1} />
                <p className="font-extralight text-sm">Vista previa no disponible para este formato</p>
                <Button onClick={() => handleDownload(viewerFile.url, cleanName(viewerFile.name))}
                  className="bg-white text-black hover:bg-zinc-200 font-extralight">
                  <Download className="w-4 h-4 mr-2" /> Descargar para abrir
                </Button>
              </div>
            )}
          </div>

        ) : (
          /* ── LISTA + SUBIDA ── */
          <div className="overflow-y-auto">
            <div className="p-5 space-y-4">

              {/* ── Zona de subida ── */}
              {hasContract ? (
                /* BLOQUEADA */
                <div className="rounded-xl border border-amber-900/30 bg-amber-950/10 p-6 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-amber-950/40 border border-amber-900/40 flex items-center justify-center mb-0.5">
                      <Lock className="w-4 h-4 text-amber-500/70" />
                    </div>
                    <p className="text-amber-600/80 text-sm font-extralight">Subida bloqueada</p>
                    <p className="text-zinc-600 text-xs font-extralight">
                      Solo se permite un contrato por empleado.<br />
                      Elimina el actual para subir uno nuevo.
                    </p>
                  </div>
                </div>
              ) : (
                /* DISPONIBLE */
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => { e.preventDefault(); setDragging(false); handleUpload(e.dataTransfer.files); }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`rounded-xl border border-dashed p-7 text-center cursor-pointer transition-all duration-150 ${
                    dragging ? 'border-zinc-500 bg-zinc-900/50' : 'border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900/20'
                  }`}
                >
                  {uploading ? (
                    <div className="flex flex-col items-center gap-2 text-zinc-400">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span className="text-sm font-extralight">Subiendo a Supabase...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-0.5">
                        <Upload className="w-4 h-4 text-zinc-500" />
                      </div>
                      <p className="text-zinc-300 text-sm font-extralight">
                        {dragging ? 'Suelta aquí' : 'Haz clic o arrastra el contrato'}
                      </p>
                      <p className="text-zinc-700 text-xs font-extralight">PDF, DOC, DOCX — máx {MAX_MB} MB</p>
                      <div className="mt-1 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800">
                        <p className="text-zinc-600 text-xs font-extralight">Solo se permite 1 contrato por empleado</p>
                      </div>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx"
                    className="hidden" onChange={e => handleUpload(e.target.files)} />
                </div>
              )}

              {/* Mensajes */}
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-950/30 border border-red-900/40 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-red-400 text-xs font-extralight">{error}</p>
                </div>
              )}
              {successMsg && (
                <div className="flex items-center gap-2 p-3 bg-green-950/30 border border-green-900/40 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <p className="text-green-400 text-xs font-extralight">{successMsg}</p>
                </div>
              )}

              {/* Lista contratos */}
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
                </div>
              ) : contracts.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="w-9 h-9 text-zinc-800 mx-auto mb-2" strokeWidth={1} />
                  <p className="text-zinc-600 text-sm font-extralight">No hay contratos subidos aún</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-zinc-600 text-xs font-extralight uppercase tracking-wider mb-2">
                    Contrato activo
                  </p>
                  {contracts.map((c) => (
                    <div key={c.path}
                      className="group flex items-center gap-3 px-4 py-3.5 bg-zinc-900/40 rounded-xl border border-zinc-800/60 hover:border-zinc-700 hover:bg-zinc-900/60 transition-all">
                      <div className="w-9 h-9 rounded-lg bg-red-950/30 border border-red-900/20 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-zinc-200 text-sm font-extralight truncate">{cleanName(c.name)}</p>
                        <p className="text-zinc-600 text-xs font-extralight">{fmtBytes(c.size)} · {fmtDate(c.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isPDF(c.name) && (
                          <button onClick={() => setViewerFile(c)}
                            className="w-7 h-7 flex items-center justify-center rounded text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors" title="Ver PDF">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => handleDownload(c.url, cleanName(c.name))}
                          className="w-7 h-7 flex items-center justify-center rounded text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors" title="Descargar">
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(c.path, c.name)}
                          disabled={deleting === c.path}
                          className="w-7 h-7 flex items-center justify-center rounded text-zinc-600 hover:text-red-400 hover:bg-red-950/30 transition-colors" title="Eliminar">
                          {deleting === c.path
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2  className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EmployeeContractModal;