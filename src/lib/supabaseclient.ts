// src/lib/supabaseclient.ts

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Buckets ──────────────────────────────────────────────────────────────────
export const REPORTS_BUCKET = 'task-reports';
export const AVATARS_BUCKET = 'avatars';
export const MEDIA_BUCKET   = 'diseno-media';   // ← nuevo: imágenes y videos de diseño

// ─── Reports ──────────────────────────────────────────────────────────────────
export async function uploadReportFile(
  file: File,
  taskId: string,
  uid: string,
): Promise<{ url: string; name: string; type: string; size: number }> {
  const ext      = file.name.split('.').pop() ?? 'bin';
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const path     = `${taskId}/${uid}/${filename}`;

  const { error } = await supabase.storage
    .from(REPORTS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) throw new Error(`Error al subir: ${error.message}`);

  const { data } = supabase.storage.from(REPORTS_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, name: file.name, type: file.type, size: file.size };
}

export async function deleteReportFile(publicUrl: string): Promise<void> {
  const marker = `/${REPORTS_BUCKET}/`;
  const idx    = publicUrl.indexOf(marker);
  if (idx === -1) return;
  const path = publicUrl.slice(idx + marker.length).split('?')[0];
  const { error } = await supabase.storage.from(REPORTS_BUCKET).remove([path]);
  if (error) console.error('Error eliminando reporte:', error.message);
}

// ─── Avatars ──────────────────────────────────────────────────────────────────
export interface AvatarRecord {
  url:        string;
  path:       string;
  uploadedAt: string;
}

export async function uploadAvatarFile(
  file: File,
  uid: string,
): Promise<{ url: string; path: string }> {
  const ext  = file.name.split('.').pop() ?? 'jpg';
  const path = `${uid}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) throw new Error(`Error al subir avatar: ${error.message}`);

  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
  return { url: `${data.publicUrl}?t=${Date.now()}`, path };
}

export async function deleteAvatarByPath(path: string): Promise<void> {
  const cleanPath = path.split('?')[0];
  const { error } = await supabase.storage.from(AVATARS_BUCKET).remove([cleanPath]);
  if (error) console.error('Error eliminando avatar:', error.message);
}

export function extractAvatarPath(publicUrl: string): string {
  const marker = `/${AVATARS_BUCKET}/`;
  const idx    = publicUrl.indexOf(marker);
  if (idx === -1) return '';
  return publicUrl.slice(idx + marker.length).split('?')[0];
}

// ─── Media (Panel de Diseño) ──────────────────────────────────────────────────
export interface MediaUploadResult {
  url:  string;
  path: string;
  name: string;
  type: string;
  size: number;
}

/**
 * Sube un archivo multimedia al bucket de diseño.
 * Ruta: diseno-media/{uid}/{timestamp}_{random}.{ext}
 */
export async function uploadMediaFile(
  file: File,
  uid: string,
): Promise<MediaUploadResult> {
  const ext      = file.name.split('.').pop() ?? 'bin';
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const path     = `${uid}/${filename}`;

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) throw new Error(`Error al subir archivo: ${error.message}`);

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return {
    url:  `${data.publicUrl}?t=${Date.now()}`,
    path,
    name: file.name,
    type: file.type,
    size: file.size,
  };
}

/**
 * Elimina un archivo del bucket de diseño por su path.
 */
export async function deleteMediaFile(path: string): Promise<void> {
  const cleanPath = path.split('?')[0];
  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([cleanPath]);
  if (error) throw new Error(`Error eliminando archivo: ${error.message}`);
}

/**
 * Extrae el path del bucket a partir de la URL pública.
 */
export function extractMediaPath(publicUrl: string): string {
  const marker = `/${MEDIA_BUCKET}/`;
  const idx    = publicUrl.indexOf(marker);
  if (idx === -1) return '';
  return publicUrl.slice(idx + marker.length).split('?')[0];
}