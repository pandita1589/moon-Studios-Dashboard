/**
 * BarcodeScannerModal.tsx
 * Escanea QR o código de barras — cámara en vivo + subida de imagen
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ScanLine, CheckCircle, XCircle, Camera, RefreshCw,
  User, Shield, Hash, AlertCircle, ImagePlus, Loader2
} from 'lucide-react';
import type { UserProfile, UserRole } from '@/types';

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  CEO:            { label: 'CEO',            color: 'text-purple-400', bg: 'bg-purple-950/60', border: 'border-purple-800/60' },
  Administración: { label: 'Administración', color: 'text-blue-400',   bg: 'bg-blue-950/60',   border: 'border-blue-800/60'   },
  Empleado:       { label: 'Empleado',       color: 'text-zinc-400',   bg: 'bg-zinc-800/60',   border: 'border-zinc-700/60'   },
};

interface ScanResult { uid: string; name: string; role: UserRole; }
interface VerifiedEmployee { found: boolean; user?: UserProfile; scanData?: ScanResult; }
interface Props { open: boolean; onClose: () => void; allUsers: UserProfile[]; }

type Mode = 'idle' | 'camera' | 'image' | 'loading';

const BarcodeScannerModal: React.FC<Props> = ({ open, onClose, allUsers }) => {
  const videoRef      = useRef<HTMLVideoElement>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const controlsRef   = useRef<any>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [mode,    setMode]    = useState<Mode>('idle');
  const [error,   setError]   = useState<string | null>(null);
  const [result,  setResult]  = useState<VerifiedEmployee | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  /* ── Procesar texto escaneado ── */
  const processRaw = useCallback((raw: string) => {
    try {
      const parsed: ScanResult = JSON.parse(raw);
      const found = allUsers.find(u => u.uid === parsed.uid);
      setResult({ found: !!found, user: found, scanData: parsed });
    } catch {
      const found = allUsers.find(u => u.uid === raw.trim());
      if (found) {
        setResult({ found: true, user: found, scanData: { uid: found.uid, name: found.displayName ?? '', role: found.role } });
      } else {
        setResult({ found: false, scanData: { uid: raw, name: '—', role: 'Empleado' } });
      }
    }
  }, [allUsers]);

  /* ── Detener todo ── */
  const stopAll = useCallback(() => {
    try { controlsRef.current?.stop(); } catch { /* ignore */ }
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
    streamRef.current   = null;
    controlsRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  /* ── CÁMARA — getUserMedia primero, luego @zxing ── */
  const startCamera = useCallback(async () => {
    setError(null);
    setResult(null);
    setPreview(null);
    setMode('loading');

    try {
      // 1) Pedir permiso y obtener stream directamente
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;

      // 2) Conectar al <video>
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      setMode('camera');

      // 3) Importar @zxing y decodificar desde el stream ya activo
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();

      controlsRef.current = await reader.decodeFromStream(
        stream,
        videoRef.current!,
        (res, _err) => {
          if (res) {
            const text = res.getText();
            controlsRef.current?.stop();
            stopAll();
            processRaw(text);
            setMode('idle');
          }
        }
      );
    } catch (e: any) {
      stopAll();
      setMode('idle');
      if (e?.name === 'NotAllowedError') {
        setError('Permiso de cámara denegado. Habilítalo en la configuración del navegador (🔒 en la barra de dirección) y recarga la página.');
      } else if (e?.name === 'NotFoundError') {
        setError('No se encontró ninguna cámara. Usa "Subir imagen" en su lugar.');
      } else {
        setError('Error al acceder a la cámara: ' + (e?.message ?? 'desconocido'));
      }
    }
  }, [processRaw, stopAll]);

  /* ── IMAGEN — decodificar QR/barcode desde archivo ── */
  const handleImageUpload = useCallback(async (file: File) => {
    if (!file) return;
    setError(null);
    setResult(null);
    setMode('loading');

    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();

      // Cargar imagen en un elemento img
      const img = new Image();
      img.src = objectUrl;
      await new Promise<void>((res, rej) => {
        img.onload  = () => res();
        img.onerror = () => rej(new Error('No se pudo cargar la imagen'));
      });

      // Dibujar en canvas y pasar al decoder
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);

      const decoded = await reader.decodeFromCanvas(canvas);
      URL.revokeObjectURL(objectUrl);
      processRaw(decoded.getText());
      setMode('image');
    } catch {
      setMode('image');
      setError('No se detectó ningún QR ni código de barras. Intenta con una imagen más clara o recortada.');
    }
  }, [processRaw]);

  /* ── Reset ── */
  const reset = () => {
    stopAll();
    setResult(null);
    setError(null);
    setPreview(null);
    setMode('idle');
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  useEffect(() => {
    if (!open) reset();
    return () => { if (!open) stopAll(); };
  }, [open]);

  const showVideo = mode === 'camera' || mode === 'loading';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { stopAll(); onClose(); } }}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="font-extralight text-lg flex items-center gap-2">
            <ScanLine className="w-4 h-4 text-zinc-400" /> Verificar Empleado
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">

          {/* ── Visor ── */}
          {!result && (
            <div className="relative bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800" style={{ aspectRatio: '4/3' }}>

              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                muted playsInline
                style={{ display: showVideo ? 'block' : 'none' }}
              />

              {mode === 'image' && preview && (
                <img src={preview} alt="preview" className="w-full h-full object-contain bg-zinc-950" />
              )}

              {/* Crosshair animado */}
              {mode === 'camera' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-52 h-52 border-2 border-white/30 rounded-lg relative">
                    <span className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white rounded-tl" />
                    <span className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white rounded-tr" />
                    <span className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white rounded-bl" />
                    <span className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white rounded-br" />
                    <div className="absolute inset-x-2 h-0.5 bg-white/60 animate-bounce" style={{ top: '50%' }} />
                  </div>
                  <p className="absolute bottom-3 left-0 right-0 text-center text-white/40 text-xs font-extralight">
                    Apunta al QR o código de barras
                  </p>
                </div>
              )}

              {mode === 'loading' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-900/80">
                  <Loader2 className="w-8 h-8 text-zinc-400 animate-spin" />
                  <p className="text-zinc-500 text-sm font-extralight">Procesando...</p>
                </div>
              )}

              {mode === 'idle' && !preview && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <Camera className="w-10 h-10 text-zinc-700" />
                  <p className="text-zinc-600 text-sm font-extralight">Selecciona una opción</p>
                </div>
              )}
            </div>
          )}

          {/* ── Error ── */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-950/40 border border-red-900 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm font-extralight">{error}</p>
            </div>
          )}

          {/* ── Resultado ── */}
          {result && (
            <div className={`p-4 rounded-lg border space-y-4 ${
              result.found ? 'bg-green-950/30 border-green-800/60' : 'bg-red-950/30 border-red-800/60'
            }`}>
              <div className="flex items-center gap-3">
                {result.found
                  ? <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0" />
                  : <XCircle     className="w-6 h-6 text-red-400 flex-shrink-0" />
                }
                <div>
                  <p className={`font-extralight text-base ${result.found ? 'text-green-400' : 'text-red-400'}`}>
                    {result.found ? 'Empleado Verificado ✓' : 'No encontrado en el sistema ✗'}
                  </p>
                  <p className="text-zinc-500 text-xs font-extralight">
                    {result.found
                      ? 'El código pertenece a un usuario registrado.'
                      : 'El código escaneado no coincide con ningún usuario.'}
                  </p>
                </div>
              </div>

              {result.found && result.user && (
                <div className="space-y-2">
                  {[
                    { icon: User,   label: 'Nombre', value: result.user.displayName },
                    { icon: Hash,   label: 'UID',    value: result.user.uid },
                    { icon: Shield, label: 'Rol',    value: result.user.role },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-center gap-2 text-sm">
                      <Icon className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                      <span className="text-zinc-500 font-extralight w-14">{label}:</span>
                      <span className="text-zinc-200 font-extralight">{value}</span>
                    </div>
                  ))}
                  <Badge className={`${ROLE_CONFIG[result.user.role]?.bg} ${ROLE_CONFIG[result.user.role]?.color} ${ROLE_CONFIG[result.user.role]?.border} border font-extralight mt-1`}>
                    {ROLE_CONFIG[result.user.role]?.label}
                  </Badge>
                </div>
              )}
            </div>
          )}

          {/* ── Acciones ── */}
          {result ? (
            <Button onClick={reset} className="w-full bg-white text-black hover:bg-zinc-200 font-extralight">
              <RefreshCw className="w-4 h-4 mr-2" /> Escanear otro
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {mode === 'camera' ? (
                <Button variant="outline" onClick={() => { stopAll(); setMode('idle'); }}
                  className="border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 font-extralight">
                  Detener cámara
                </Button>
              ) : (
                <Button onClick={startCamera} disabled={mode === 'loading'}
                  className="bg-white text-black hover:bg-zinc-200 font-extralight">
                  <Camera className="w-4 h-4 mr-2" />
                  {mode === 'loading' ? 'Iniciando...' : 'Usar cámara'}
                </Button>
              )}

              <Button variant="outline" disabled={mode === 'loading'}
                onClick={() => imageInputRef.current?.click()}
                className="border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 font-extralight">
                <ImagePlus className="w-4 h-4 mr-2" /> Subir imagen
              </Button>

              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { if (e.target.files?.[0]) handleImageUpload(e.target.files[0]); }}
              />
            </div>
          )}

          {mode === 'idle' && !result && !error && (
            <p className="text-zinc-700 text-xs font-extralight text-center">
              Usa la cámara en tiempo real · o sube una foto de la credencial
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BarcodeScannerModal;