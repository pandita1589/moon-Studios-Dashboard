import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { updateUserProfile, updateUserPassword, getUserProfile } from '@/lib/firebase';
import { uploadAvatarFile, deleteAvatarByPath } from '@/lib/supabaseclient';
import { Switch } from '@/components/ui/switch';
import {
  Moon, Sun, Bell, User, Shield, Palette,
  PanelLeft, Camera, Phone, Loader2, Trash2, Clock, Eye, X,
  Volume2, VolumeX, Play, MessageSquare, Mail, GitBranch, CheckCircle2,
} from 'lucide-react';
import { Megaphone as MegaIcon } from 'lucide-react';
import { previewSound } from '@/lib/notificationSound';
import type { SoundType } from '@/lib/notificationSound';

interface AvatarRecord { url: string; path: string; uploadedAt: string; }
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
type TabKey = 'profile' | 'appearance' | 'notifications' | 'security';

const TABS: { key: TabKey; label: string; icon: React.FC<any> }[] = [
  { key: 'profile',       label: 'Perfil',        icon: User    },
  { key: 'appearance',    label: 'Apariencia',     icon: Palette },
  { key: 'notifications', label: 'Notificaciones', icon: Bell    },
  { key: 'security',      label: 'Seguridad',      icon: Shield  },
];

const SOUND_OPTIONS: { value: SoundType; label: string; desc: string }[] = [
  { value: 'none',    label: 'Silencio',  desc: 'Sin sonido'                       },
  { value: 'soft',    label: 'Suave',     desc: 'Doble tono sutil'                  },
  { value: 'default', label: 'Estándar',  desc: 'Do → Mi, clásico de notificación'  },
  { value: 'ping',    label: 'Ping',      desc: 'Tono limpio de alta frecuencia'    },
  { value: 'chime',   label: 'Campana',   desc: 'Acorde de tres notas'              },
];

const NOTIF_CATEGORIES = [
  { key: 'notifyAnnouncements', label: 'Anuncios',   icon: MegaIcon,       color: '#a78bfa' },
  { key: 'notifyEmails',        label: 'Correos',    icon: Mail,           color: '#60a5fa' },
  { key: 'notifyThreads',       label: 'Hilos',      icon: GitBranch,      color: '#34d399' },
  { key: 'notifyMessages',      label: 'Mensajería', icon: MessageSquare,  color: '#fb923c' },
] as const;

// ── Shared style helpers ───────────────────────────────────────────────────────
const bd = 'hsl(var(--border))';
const sf = 'hsl(var(--card))';
const sc = 'hsl(var(--secondary))';

const SectionTitle: React.FC<{ title: string; desc: string }> = ({ title, desc }) => (
  <div>
    <h2 className="text-base font-light text-white tracking-wide">{title}</h2>
    <p className="text-xs font-light mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{desc}</p>
  </div>
);

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[10px] tracking-widest uppercase font-light mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
    {children}
  </p>
);

const Row: React.FC<{ children: React.ReactNode; onClick?: () => void; highlight?: boolean }> = ({ children, onClick, highlight }) => (
  <div
    onClick={onClick}
    className={`flex items-center justify-between p-4 rounded-2xl transition-all ${onClick ? 'cursor-pointer hover:brightness-110' : ''}`}
    style={{ background: sc, border: `1px solid ${bd}`, outline: highlight ? `1px solid rgba(239,68,68,0.4)` : 'none' }}
  >
    {children}
  </div>
);

// ═════════════════════════════════════════════════════════════════════════════
const Settings: React.FC = () => {
  const { userProfile, refreshProfile } = useAuth();
  const { settings, toggleTheme, toggleSidebar, updateSettings, isDark } = useSettings();

  const [activeTab,      setActiveTab]      = useState<TabKey>('profile');
  const [displayName,    setDisplayName]    = useState(userProfile?.displayName || '');
  const [phone,          setPhone]          = useState(userProfile?.phone || '');
  const [photoPreview,   setPhotoPreview]   = useState<string | null>(userProfile?.avatar || null);
  const [pendingFile,    setPendingFile]    = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [newPassword,    setNewPassword]    = useState('');
  const [confirmPw,      setConfirmPw]      = useState('');
  const [message,        setMessage]        = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving,         setSaving]         = useState(false);
  const [avatarHistory,  setAvatarHistory]  = useState<AvatarRecord[]>([]);
  const [deletingPath,   setDeletingPath]   = useState<string | null>(null);
  const [previewUrl,     setPreviewUrl]     = useState<string | null>(null);
  const [focusedField,   setFocusedField]   = useState<string | null>(null);
  const [mobileTabOpen,  setMobileTabOpen]  = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  };

  // Load avatar history & auto-clean old ones
  useEffect(() => {
    if (!userProfile?.uid) return;
    (async () => {
      try {
        const data = await getUserProfile(userProfile.uid);
        const history: AvatarRecord[] = data?.avatarHistory ?? [];
        const currentUrl = (userProfile.avatar ?? '').split('?')[0];
        const now = Date.now();
        const toDelete = history.filter(r => {
          const isOld     = now - new Date(r.uploadedAt).getTime() > SEVEN_DAYS_MS;
          const isCurrent = r.url.split('?')[0] === currentUrl;
          return isOld && !isCurrent;
        });
        if (toDelete.length > 0) {
          await Promise.allSettled(toDelete.map(r => deleteAvatarByPath(r.path)));
          const clean = history.filter(r => !toDelete.some(d => d.path === r.path));
          await updateUserProfile(userProfile.uid, { avatarHistory: clean });
          setAvatarHistory(clean);
        } else {
          setAvatarHistory(history);
        }
      } catch (e) { console.error(e); }
    })();
  }, [userProfile?.uid]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showMsg('error', 'La imagen no debe superar los 2 MB'); return; }
    if (!file.type.startsWith('image/')) { showMsg('error', 'Solo se permiten archivos de imagen'); return; }
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setPendingFile(file);
  };

  const handleUpdateProfile = async () => {
    if (!userProfile?.uid) return;
    if (phone && !/^\+?[\d\s\-()\\.]{7,20}$/.test(phone)) { showMsg('error', 'Formato de teléfono inválido. Ej: +51 999 999 999'); return; }
    setSaving(true);
    try {
      let avatar = userProfile?.avatar ?? '';
      let newHistory = [...avatarHistory];
      if (pendingFile) {
        setUploadingPhoto(true);
        const { url, path } = await uploadAvatarFile(pendingFile, userProfile.uid);
        avatar = url;
        newHistory = [{ url, path, uploadedAt: new Date().toISOString() }, ...newHistory];
        setUploadingPhoto(false);
        setPendingFile(null);
        setAvatarHistory(newHistory);
      }
      await updateUserProfile(userProfile.uid, { displayName, phone, avatar, avatarHistory: newHistory });
      await refreshProfile();
      showMsg('success', 'Perfil actualizado correctamente');
    } catch (err: any) {
      setUploadingPhoto(false);
      showMsg('error', err?.message ?? 'Error al actualizar perfil');
    } finally { setSaving(false); }
  };

  const handleDeleteAvatar = async (record: AvatarRecord) => {
    if (!userProfile?.uid) return;
    setDeletingPath(record.path);
    try {
      await deleteAvatarByPath(record.path);
      const newHistory = avatarHistory.filter(r => r.path !== record.path);
      await updateUserProfile(userProfile.uid, { avatarHistory: newHistory });
      setAvatarHistory(newHistory);
    } catch { showMsg('error', 'Error al eliminar el avatar'); }
    finally { setDeletingPath(null); }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPw) { showMsg('error', 'Las contraseñas no coinciden'); return; }
    if (newPassword.length < 6) { showMsg('error', 'Mínimo 6 caracteres'); return; }
    try {
      await updateUserPassword(newPassword);
      showMsg('success', 'Contraseña actualizada');
      setNewPassword(''); setConfirmPw('');
    } catch { showMsg('error', 'Error al cambiar contraseña. Puede que necesites re-autenticarte'); }
  };

  const daysUntilExpiry = (uploadedAt: string) =>
    Math.max(0, 7 - Math.floor((Date.now() - new Date(uploadedAt).getTime()) / 86_400_000));

  const currentAvatarUrl = (userProfile?.avatar ?? '').split('?')[0];
  const pastAvatars = avatarHistory.filter(r => r.url.split('?')[0] !== currentAvatarUrl);

  const isMuted        = settings.notificationsMuted ?? false;
  const currentSound   = settings.notificationSound  as SoundType ?? 'default';
  const currentVolume  = settings.notificationVolume ?? 0.7;

  const inputCls = "w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none transition-all";
  const inputSt  = (f: string): React.CSSProperties => ({
    background:  sc,
    border:      `1px solid ${focusedField === f ? 'rgba(255,255,255,0.2)' : bd}`,
    color:       'hsl(var(--foreground))',
    caretColor:  'hsl(var(--foreground))',
  });

  // ── Active tab label for mobile ─────────────────────────────────────────
  const activeTabLabel = TABS.find(t => t.key === activeTab)?.label ?? '';
  const ActiveTabIcon  = TABS.find(t => t.key === activeTab)?.icon ?? User;

  return (
    <>
      {/* Lightbox */}
      {previewUrl && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center animate-fade-in"
          style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(8px)' }}
          onClick={() => setPreviewUrl(null)}>
          <button className="absolute top-5 right-5 w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white" onClick={() => setPreviewUrl(null)}>
            <X className="w-4 h-4" />
          </button>
          <img src={previewUrl} alt="Preview" className="max-w-[88vw] max-h-[82vh] object-contain rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Toast */}
      {message && (
        <div className="fixed top-5 right-5 z-[9998] px-4 py-3 rounded-2xl text-xs font-light animate-fade-in"
          style={{
            background: message.type === 'success' ? 'rgba(16,185,129,0.12)' : 'rgba(220,38,38,0.12)',
            border:     `1px solid ${message.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(220,38,38,0.3)'}`,
            color:      message.type === 'success' ? '#6ee7b7' : '#fca5a5',
            boxShadow:  '0 8px 32px rgba(0,0,0,0.4)',
          }}>
          <div className="flex items-center gap-2">
            {message.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />}
            {message.text}
          </div>
        </div>
      )}

      <div className="animate-fade-in">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-xl font-light text-white tracking-tight mb-1">Configuración</h1>
          <p className="text-sm font-light" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Personaliza tu cuenta y preferencias
          </p>
        </div>

        {/* ── Mobile: tab selector ── */}
        <div className="md:hidden mb-5">
          <button
            onClick={() => setMobileTabOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl"
            style={{ background: sf, border: `1px solid ${bd}` }}
          >
            <div className="flex items-center gap-2.5">
              <ActiveTabIcon className="w-4 h-4" style={{ color: 'hsl(var(--muted-foreground))' }} strokeWidth={1.5} />
              <span className="text-sm font-light text-white">{activeTabLabel}</span>
            </div>
            <span className="text-xs font-light" style={{ color: 'hsl(var(--muted-foreground))' }}>▾</span>
          </button>
          {mobileTabOpen && (
            <div className="mt-1 rounded-2xl overflow-hidden border animate-fade-in"
              style={{ background: sf, borderColor: bd }}>
              {TABS.map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => { setActiveTab(key); setMobileTabOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-light transition-colors hover:bg-white/[0.04]"
                  style={{ color: activeTab === key ? 'white' : 'hsl(var(--muted-foreground))' }}>
                  <Icon className="w-4 h-4" strokeWidth={1.5} />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-8">
          {/* ── Desktop sidebar tabs ── */}
          <aside className="hidden md:flex flex-col w-44 flex-shrink-0">
            <p className="text-[9px] tracking-[0.35em] uppercase font-light mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Secciones
            </p>
            <nav className="space-y-0.5">
              {TABS.map(({ key, label, icon: Icon }) => {
                const active = activeTab === key;
                return (
                  <button key={key} onClick={() => setActiveTab(key)}
                    className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-light transition-all ${active ? 'bg-white/[0.07] text-white' : 'text-zinc-500 hover:text-white hover:bg-white/[0.04]'}`}>
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={active ? 2 : 1.5} />
                    {label}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* ── Content ── */}
          <main className="flex-1 min-w-0">

            {/* ══ PERFIL ══════════════════════════════════════════════════ */}
            {activeTab === 'profile' && (
              <div className="space-y-6 max-w-2xl">
                <SectionTitle title="Información del Perfil" desc="Actualiza tu foto, nombre y datos de contacto" />

                {/* Avatar + Fields */}
                <div className="rounded-2xl p-5" style={{ background: sf, border: `1px solid ${bd}` }}>
                  <div className="flex flex-col sm:flex-row gap-6 items-start">
                    {/* Avatar */}
                    <div className="flex flex-col items-center gap-2 flex-shrink-0">
                      <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />
                      <div
                        className="relative group cursor-pointer rounded-2xl overflow-hidden"
                        style={{ width: '100px', height: '100px', border: `1px solid ${bd}`, background: 'hsl(var(--muted))' }}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {uploadingPhoto ? (
                          <div className="w-full h-full flex items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                          </div>
                        ) : photoPreview ? (
                          <img src={photoPreview} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <User className="w-8 h-8 text-zinc-600" strokeWidth={1} />
                          </div>
                        )}
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl"
                          style={{ background: 'rgba(0,0,0,0.6)' }}>
                          <Camera className="w-4 h-4 text-white" strokeWidth={1.5} />
                          <span className="text-[9px] text-white font-light tracking-wide">Cambiar</span>
                        </div>
                      </div>
                      <span className="text-[9px] font-light text-center" style={{ color: pendingFile ? '#f59e0b' : 'hsl(var(--muted-foreground))' }}>
                        {pendingFile ? '● Pendiente' : 'JPG · PNG · 2 MB'}
                      </span>
                    </div>

                    {/* Fields */}
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                      <div>
                        <FieldLabel>Nombre completo</FieldLabel>
                        <input className={inputCls} style={inputSt('name')} value={displayName}
                          onChange={e => setDisplayName(e.target.value)}
                          onFocus={() => setFocusedField('name')} onBlur={() => setFocusedField(null)}
                          placeholder="Tu nombre" />
                      </div>
                      <div>
                        <FieldLabel>Correo electrónico</FieldLabel>
                        <input className={inputCls} style={{ ...inputSt('email'), opacity: 0.4, cursor: 'not-allowed' }}
                          value={userProfile?.email || ''} disabled />
                      </div>
                      <div>
                        <FieldLabel><span className="flex items-center gap-1"><Phone className="w-3 h-3" />Teléfono</span></FieldLabel>
                        <input className={inputCls} style={inputSt('phone')} type="tel" value={phone}
                          onChange={e => setPhone(e.target.value)}
                          onFocus={() => setFocusedField('phone')} onBlur={() => setFocusedField(null)}
                          placeholder="+51 999 999 999" />
                      </div>
                      <div>
                        <FieldLabel>Rol</FieldLabel>
                        <input className={inputCls} style={{ ...inputSt('role'), opacity: 0.4, cursor: 'not-allowed', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '11px' }}
                          value={userProfile?.role || ''} disabled />
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-4 flex justify-end" style={{ borderTop: `1px solid ${bd}` }}>
                    <button onClick={handleUpdateProfile} disabled={saving || uploadingPhoto}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-light transition-all hover:opacity-90 disabled:opacity-40"
                      style={{ background: '#fff', color: '#000' }}>
                      {(saving || uploadingPhoto) ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Guardando...</> : 'Guardar Cambios'}
                    </button>
                  </div>
                </div>

                {/* Avatar history */}
                {pastAvatars.length > 0 && (
                  <div className="rounded-2xl p-5" style={{ background: sf, border: `1px solid ${bd}` }}>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm font-light text-white">Avatares Anteriores</p>
                        <p className="text-xs font-light mt-0.5 flex items-center gap-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          <Clock className="w-3 h-3" strokeWidth={1.5} />
                          Se eliminan automáticamente a los 7 días
                        </p>
                      </div>
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full font-light"
                        style={{ background: 'rgba(255,255,255,0.06)', color: 'hsl(var(--muted-foreground))' }}>
                        {pastAvatars.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                      {pastAvatars.map(r => {
                        const days = daysUntilExpiry(r.uploadedAt);
                        const exColor = days <= 1 ? '#ef4444' : days <= 3 ? '#f59e0b' : 'hsl(var(--muted-foreground))';
                        return (
                          <div key={r.path} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${bd}` }}>
                            <div className="relative group" style={{ height: '80px' }}>
                              <img src={r.url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                              <div className="absolute inset-0 flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ background: 'rgba(0,0,0,0.7)' }}>
                                <button onClick={() => setPreviewUrl(r.url)}
                                  className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-white">
                                  <Eye className="w-3 h-3" strokeWidth={1.5} />
                                </button>
                                <button onClick={() => handleDeleteAvatar(r)} disabled={deletingPath === r.path}
                                  className="w-7 h-7 rounded-lg bg-red-500/40 flex items-center justify-center text-white">
                                  {deletingPath === r.path ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" strokeWidth={1.5} />}
                                </button>
                              </div>
                            </div>
                            <div className="px-2 py-1.5">
                              <div className="flex items-center gap-1">
                                <div className="flex-1 h-0.5 rounded-full" style={{ background: bd }}>
                                  <div className="h-full rounded-full" style={{ width: `${(days / 7) * 100}%`, background: exColor }} />
                                </div>
                                <span className="text-[9px] font-light" style={{ color: exColor }}>{days}d</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ══ APARIENCIA ═════════════════════════════════════════════ */}
            {activeTab === 'appearance' && (
              <div className="space-y-5 max-w-lg">
                <SectionTitle title="Apariencia" desc="Personaliza la apariencia visual del panel" />

                <div className="space-y-3">
                  {/* Theme toggle */}
                  <Row onClick={toggleTheme}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ background: isDark ? '#1e1e1e' : 'rgba(251,191,36,0.1)' }}>
                        {isDark
                          ? <Moon className="w-4 h-4 text-zinc-400" strokeWidth={1.5} />
                          : <Sun  className="w-4 h-4" style={{ color: '#f59e0b' }} strokeWidth={1.5} />}
                      </div>
                      <div>
                        <p className="text-sm font-light text-white">Modo {isDark ? 'Oscuro' : 'Claro'}</p>
                        <p className="text-xs font-light" style={{ color: 'hsl(var(--muted-foreground))' }}>Haz clic para alternar</p>
                      </div>
                    </div>
                    <div style={{ width: '44px', height: '24px', borderRadius: '12px', background: isDark ? '#333' : '#f59e0b', transition: 'background 0.3s', position: 'relative', flexShrink: 0 }}>
                      <div style={{ position: 'absolute', top: '3px', left: isDark ? '3px' : '21px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.3s', boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }} />
                    </div>
                  </Row>

                  {/* Sidebar toggle */}
                  <Row>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: sc, border: `1px solid ${bd}` }}>
                        <PanelLeft className="w-4 h-4" style={{ color: 'hsl(var(--muted-foreground))' }} strokeWidth={1.5} />
                      </div>
                      <div>
                        <p className="text-sm font-light text-white">{settings.sidebarCollapsed ? 'Sidebar Colapsado' : 'Sidebar Expandido'}</p>
                        <p className="text-xs font-light" style={{ color: 'hsl(var(--muted-foreground))' }}>{settings.sidebarCollapsed ? 'Solo iconos' : 'Iconos y texto'}</p>
                      </div>
                    </div>
                    <Switch checked={!settings.sidebarCollapsed} onCheckedChange={toggleSidebar} />
                  </Row>
                </div>
              </div>
            )}

            {/* ══ NOTIFICACIONES ══════════════════════════════════════════ */}
            {activeTab === 'notifications' && (
              <div className="space-y-5 max-w-lg">
                <SectionTitle title="Notificaciones" desc="Controla qué recibes, cómo suena y cuándo" />

                {/* Master mute */}
                <div className="space-y-2">
                  <FieldLabel>Estado global</FieldLabel>
                  <Row onClick={() => updateSettings({ notificationsMuted: !isMuted })} highlight={isMuted}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ background: isMuted ? 'rgba(239,68,68,0.1)' : sc, border: `1px solid ${isMuted ? 'rgba(239,68,68,0.2)' : bd}` }}>
                        {isMuted
                          ? <VolumeX className="w-4 h-4" style={{ color: '#ef4444' }} strokeWidth={1.5} />
                          : <Volume2 className="w-4 h-4 text-zinc-400" strokeWidth={1.5} />}
                      </div>
                      <div>
                        <p className="text-sm font-light" style={{ color: isMuted ? '#ef4444' : 'white' }}>
                          {isMuted ? 'Silenciado' : 'Sonido activado'}
                        </p>
                        <p className="text-xs font-light" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          {isMuted ? 'Haz clic para activar' : 'Haz clic para silenciar'}
                        </p>
                      </div>
                    </div>
                    <Switch checked={!isMuted} onCheckedChange={c => updateSettings({ notificationsMuted: !c })} />
                  </Row>
                </div>

                {/* Sound type */}
                <div className="space-y-2">
                  <FieldLabel>Tipo de tono</FieldLabel>
                  <div className="rounded-2xl overflow-hidden border" style={{ borderColor: bd }}>
                    {SOUND_OPTIONS.map((opt, i) => {
                      const isSelected = currentSound === opt.value;
                      return (
                        <div key={opt.value}
                          onClick={() => updateSettings({ notificationSound: opt.value })}
                          className="flex items-center justify-between p-3.5 cursor-pointer transition-colors hover:bg-white/[0.03]"
                          style={{
                            background: isSelected ? sc : 'transparent',
                            borderTop:  i > 0 ? `1px solid ${bd}` : 'none',
                          }}>
                          <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ border: `1.5px solid ${isSelected ? 'white' : 'hsl(var(--muted-foreground))' }` }}>
                              {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                            </div>
                            <div>
                              <p className="text-sm font-light" style={{ color: isSelected ? 'white' : 'hsl(var(--muted-foreground))' }}>{opt.label}</p>
                              <p className="text-xs font-light" style={{ color: 'hsl(var(--muted-foreground))' }}>{opt.desc}</p>
                            </div>
                          </div>
                          {opt.value !== 'none' && (
                            <button onClick={e => { e.stopPropagation(); if (!isMuted) previewSound(opt.value); }}
                              disabled={isMuted}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-light transition-opacity disabled:opacity-30"
                              style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${bd}`, color: 'hsl(var(--muted-foreground))' }}>
                              <Play className="w-3 h-3" strokeWidth={1.5} />
                              Probar
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Volume */}
                <div className="space-y-2">
                  <FieldLabel>Volumen</FieldLabel>
                  <div className="p-4 rounded-2xl" style={{ background: sc, border: `1px solid ${bd}`, opacity: isMuted ? 0.4 : 1 }}>
                    <div className="flex items-center gap-3">
                      <VolumeX className="w-4 h-4 text-zinc-500 flex-shrink-0" strokeWidth={1.5} />
                      <input type="range" min={0} max={1} step={0.05} value={currentVolume} disabled={isMuted}
                        onChange={e => updateSettings({ notificationVolume: parseFloat(e.target.value) })}
                        className="flex-1 accent-white" style={{ cursor: isMuted ? 'not-allowed' : 'pointer' }} />
                      <Volume2 className="w-4 h-4 text-zinc-500 flex-shrink-0" strokeWidth={1.5} />
                      <span className="text-xs font-light w-8 text-right" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {Math.round(currentVolume * 100)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Categories */}
                <div className="space-y-2">
                  <FieldLabel>Categorías</FieldLabel>
                  <div className="rounded-2xl overflow-hidden border" style={{ borderColor: bd }}>
                    {NOTIF_CATEGORIES.map(({ key, label, icon: Icon, color }, i) => {
                      const enabled = settings[key as keyof typeof settings] !== false;
                      return (
                        <div key={key} className="flex items-center justify-between p-3.5"
                          style={{ borderTop: i > 0 ? `1px solid ${bd}` : 'none' }}>
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                              style={{ background: enabled ? `${color}18` : 'rgba(255,255,255,0.04)', border: `1px solid ${enabled ? `${color}30` : bd}` }}>
                              <Icon className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: enabled ? color : 'hsl(var(--muted-foreground))' }} />
                            </div>
                            <p className="text-sm font-light" style={{ color: enabled ? 'white' : 'hsl(var(--muted-foreground))' }}>{label}</p>
                          </div>
                          <Switch checked={enabled} onCheckedChange={c => updateSettings({ [key]: c })} />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Push */}
                <div className="space-y-2">
                  <FieldLabel>Navegador</FieldLabel>
                  <Row>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: sc, border: `1px solid ${bd}` }}>
                        <Bell className="w-4 h-4 text-zinc-400" strokeWidth={1.5} />
                      </div>
                      <div>
                        <p className="text-sm font-light text-white">Notificaciones Push</p>
                        <p className="text-xs font-light" style={{ color: 'hsl(var(--muted-foreground))' }}>Alertas nativas del navegador</p>
                      </div>
                    </div>
                    <Switch checked={settings.notifications ?? false} onCheckedChange={c => updateSettings({ notifications: c })} />
                  </Row>
                </div>
              </div>
            )}

            {/* ══ SEGURIDAD ═══════════════════════════════════════════════ */}
            {activeTab === 'security' && (
              <div className="space-y-5 max-w-lg">
                <SectionTitle title="Seguridad" desc="Administra tu contraseña y acceso a la cuenta" />

                <div className="rounded-2xl p-5 space-y-4" style={{ background: sf, border: `1px solid ${bd}` }}>
                  <p className="text-sm font-light text-white">Cambiar Contraseña</p>
                  <div>
                    <FieldLabel>Nueva contraseña</FieldLabel>
                    <input type="password" className={inputCls} style={inputSt('newpw')} value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      onFocus={() => setFocusedField('newpw')} onBlur={() => setFocusedField(null)}
                      placeholder="••••••••" />
                  </div>
                  <div>
                    <FieldLabel>Confirmar contraseña</FieldLabel>
                    <input type="password" className={inputCls} style={inputSt('confpw')} value={confirmPw}
                      onChange={e => setConfirmPw(e.target.value)}
                      onFocus={() => setFocusedField('confpw')} onBlur={() => setFocusedField(null)}
                      placeholder="••••••••" />
                  </div>
                  <button onClick={handleChangePassword}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-light transition-all hover:opacity-90"
                    style={{ background: '#fff', color: '#000' }}>
                    <Shield className="w-4 h-4" strokeWidth={1.5} />
                    Cambiar Contraseña
                  </button>
                </div>

                <div className="rounded-2xl overflow-hidden border" style={{ borderColor: bd }}>
                  {[
                    { label: 'Email', value: userProfile?.email ?? '—' },
                    { label: 'UID',   value: (userProfile?.uid?.slice(0, 16) ?? '') + '…' },
                    { label: 'Rol',   value: userProfile?.role ?? '—' },
                  ].map(({ label, value }, i) => (
                    <div key={label} className="flex items-center justify-between px-4 py-3"
                      style={{ borderTop: i > 0 ? `1px solid ${bd}` : 'none' }}>
                      <span className="text-[10px] uppercase tracking-widest font-light" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</span>
                      <span className="text-xs font-light font-mono" style={{ color: 'rgba(255,255,255,0.6)' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </main>
        </div>
      </div>
    </>
  );
};

export default Settings;