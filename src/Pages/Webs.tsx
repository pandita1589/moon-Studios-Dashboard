import { useState, useEffect } from 'react';
import emailjs from '@emailjs/browser';
import {
  Globe, ExternalLink, Save, Settings, Image, MessageCircle,
  Users, Loader2, RefreshCw, Trash2, Mail, Send, X, CheckCircle,
  UserCheck, AlertCircle, Search, AtSign,
} from 'lucide-react';
import { db } from '@/lib/firebase';
import {
  doc, getDoc, setDoc, collection, getDocs,
  deleteDoc, Timestamp,
} from 'firebase/firestore';
import { toast } from 'sonner';

/* ── EmailJS config (desde .env) ─────────────────────────────────────────── */
const EJ_SERVICE  = import.meta.env.VITE_EMAILJS_SERVICE_ID  as string;
const EJ_TEMPLATE = import.meta.env.VITE_EMAILJS_TEMPLATE_ID as string;
const EJ_KEY      = import.meta.env.VITE_EMAILJS_PUBLIC_KEY  as string;

/* ── Tipos ──────────────────────────────────────────────────────────────────── */
interface FestConfig {
  logoUrl: string; discordInviteUrl: string; eventName: string; eventDate: string;
  eventLocation: string; primaryColor: string; secondaryColor: string; accentColor: string;
}
interface FestUser {
  id: string; code: string; firstName: string; lastName: string;
  email: string; phone: string; registeredAt: Timestamp | string | null;
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */
const formatDate = (value: Timestamp | string | null | undefined): string => {
  if (!value) return '—';
  try {
    const d = value instanceof Timestamp ? value.toDate() : new Date(value as string);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-ES', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
};

const CONFIG_DOC = doc(db, 'config', 'appConfig');
const USERS_COL  = collection(db, 'moon_studios_fest_2026');

/* ── Design tokens ──────────────────────────────────────────────────────────── */
const bd = 'hsl(var(--border))';
const sf = 'hsl(var(--card))';
const sc = 'hsl(var(--secondary))';
const mt = 'hsl(var(--muted-foreground))';

/* ── Shared components ──────────────────────────────────────────────────────── */
const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="space-y-1.5">
    <label className="text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>{label}</label>
    {children}
    {hint && <p className="text-[11px] font-light" style={{ color: 'rgba(255,255,255,0.2)' }}>{hint}</p>}
  </div>
);

const StyledInput: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { name: string }> = ({ name, ...props }) => (
  <input name={name} {...props}
    className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none transition-all"
    style={{ background: sc, border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' }}
    onFocus={e => e.target.style.borderColor = 'rgba(255,255,255,0.2)'}
    onBlur={e  => e.target.style.borderColor = bd}
  />
);

const SaveBtn: React.FC<{ saving: boolean; onClick: () => void }> = ({ saving, onClick }) => (
  <button onClick={onClick} disabled={saving}
    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-light transition-all hover:opacity-90 disabled:opacity-40"
    style={{ background: '#fff', color: '#000' }}>
    {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Guardando...</> : <><Save className="w-4 h-4" strokeWidth={1.5} />Guardar</>}
  </button>
);

/* ══════════════════════════════════════════════════════════════════════════════
   MOON FEST PANEL
══════════════════════════════════════════════════════════════════════════════ */
const MoonFestPanel = () => {
  const [config, setConfig] = useState<Partial<FestConfig>>({
    logoUrl: '', discordInviteUrl: '', eventName: 'MOON FEST 2026',
    eventDate: '', eventLocation: '', primaryColor: '#000000',
    secondaryColor: '#ffffff', accentColor: '#6b7280',
  });
  const [users,     setUsers]     = useState<FestUser[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [configSnap, usersSnap] = await Promise.all([getDoc(CONFIG_DOC), getDocs(USERS_COL)]);
      if (configSnap.exists()) setConfig(configSnap.data() as FestConfig);
      setUsers(usersSnap.docs.map(d => ({ ...d.data(), id: d.id }) as FestUser));
    } catch (e) { toast.error('Error cargando datos'); console.error(e); }
    setLoading(false);
  };

  const handleSave = async (fields: Partial<FestConfig>) => {
    setSaving(true);
    try {
      await setDoc(CONFIG_DOC, fields, { merge: true });
      setConfig(p => ({ ...p, ...fields }));
      toast.success('Guardado correctamente');
    } catch (e) { toast.error('Error al guardar'); console.error(e); }
    setSaving(false);
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('¿Eliminar este registro?')) return;
    try {
      await deleteDoc(doc(db, 'moon_studios_fest_2026', userId));
      setUsers(p => p.filter(u => u.id !== userId));
      toast.success('Eliminado');
    } catch { toast.error('Error al eliminar'); }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setConfig(p => ({ ...p, [name]: value }));
  };

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <div className="w-6 h-6 border border-zinc-700 border-t-zinc-300 rounded-full animate-spin" />
    </div>
  );

  const TABS = [
    { id: 'general',  label: 'General',  icon: Settings },
    { id: 'branding', label: 'Marca',    icon: Image },
    { id: 'discord',  label: 'Discord',  icon: MessageCircle },
    { id: 'users',    label: `Registrados (${users.length})`, icon: Users },
  ];

  return (
    <div className="space-y-5">
      <div className="flex gap-1 rounded-2xl p-1.5 flex-wrap" style={{ background: sc, border: `1px solid ${bd}` }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-light transition-all"
            style={{ background: activeTab === id ? 'rgba(255,255,255,0.08)' : 'transparent', color: activeTab === id ? 'white' : mt }}>
            <Icon className="w-3.5 h-3.5" strokeWidth={1.5} /> {label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <div className="rounded-2xl p-5 space-y-4" style={{ background: sf, border: `1px solid ${bd}` }}>
          <p className="text-sm font-light text-white">Configuración General</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nombre del Evento" hint="Aparece como título en la web pública">
              <StyledInput name="eventName" value={config.eventName ?? ''} onChange={handleChange} placeholder="MOON FEST 2026" />
            </Field>
            <Field label="Fecha del Evento">
              <StyledInput name="eventDate" type="date" value={config.eventDate ?? ''} onChange={handleChange} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Ubicación">
                <StyledInput name="eventLocation" value={config.eventLocation ?? ''} onChange={handleChange} placeholder="Lima, Perú" />
              </Field>
            </div>
          </div>
          {(config.eventName || config.eventDate || config.eventLocation) && (
            <div className="p-4 rounded-2xl" style={{ background: sc, border: `1px solid ${bd}` }}>
              <p className="text-[10px] uppercase tracking-widest font-light mb-2" style={{ color: mt }}>Vista previa</p>
              <p className="text-base font-light text-white">{config.eventName}</p>
              {config.eventDate && (
                <p className="text-sm font-light mt-0.5" style={{ color: mt }}>
                  {new Date(config.eventDate).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              )}
              {config.eventLocation && <p className="text-sm font-light" style={{ color: mt }}>📍 {config.eventLocation}</p>}
            </div>
          )}
          <SaveBtn saving={saving} onClick={() => handleSave({
            eventName: config.eventName ?? '', eventDate: config.eventDate ?? '', eventLocation: config.eventLocation ?? '',
          })} />
        </div>
      )}

      {activeTab === 'branding' && (
        <div className="rounded-2xl p-5 space-y-4" style={{ background: sf, border: `1px solid ${bd}` }}>
          <p className="text-sm font-light text-white">Configuración de Marca</p>
          <Field label="URL del Logo" hint="Se muestra en el header y en los tickets generados">
            <StyledInput name="logoUrl" value={config.logoUrl ?? ''} onChange={handleChange} placeholder="https://ejemplo.com/logo.png" />
          </Field>
          {config.logoUrl && (
            <div className="p-4 rounded-2xl" style={{ background: sc, border: `1px solid ${bd}` }}>
              <p className="text-[10px] uppercase tracking-widest font-light mb-3" style={{ color: mt }}>Vista previa</p>
              <img src={config.logoUrl} alt="Logo" className="h-16 object-contain"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            {([
              { key: 'primaryColor',   label: 'Primario'   },
              { key: 'secondaryColor', label: 'Secundario' },
              { key: 'accentColor',    label: 'Acento'     },
            ] as const).map(({ key, label }) => (
              <Field key={key} label={label}>
                <div className="flex gap-2">
                  <input name={key} type="color" value={config[key] ?? '#000000'} onChange={handleChange}
                    className="w-12 h-10 rounded-xl p-1 cursor-pointer"
                    style={{ background: sc, border: `1px solid ${bd}` }} />
                  <input value={config[key] ?? ''} readOnly
                    className="flex-1 px-2.5 rounded-xl text-xs font-mono font-light"
                    style={{ background: sc, border: `1px solid ${bd}`, color: mt }} />
                </div>
              </Field>
            ))}
          </div>
          <SaveBtn saving={saving} onClick={() => handleSave({
            logoUrl: config.logoUrl ?? '', primaryColor: config.primaryColor ?? '#000000',
            secondaryColor: config.secondaryColor ?? '#ffffff', accentColor: config.accentColor ?? '#6b7280',
          })} />
        </div>
      )}

      {activeTab === 'discord' && (
        <div className="rounded-2xl p-5 space-y-4" style={{ background: sf, border: `1px solid ${bd}` }}>
          <p className="text-sm font-light text-white">Configuración de Discord</p>
          <Field label="URL de Invitación" hint="Aparece en el ticket generado tras el registro">
            <StyledInput name="discordInviteUrl" value={config.discordInviteUrl ?? ''} onChange={handleChange}
              placeholder="https://discord.gg/tu-invitacion" />
          </Field>
          {config.discordInviteUrl && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl"
              style={{ background: 'rgba(88,101,242,0.1)', border: '1px solid rgba(88,101,242,0.2)' }}>
              <MessageCircle className="w-4 h-4" style={{ color: '#818cf8' }} strokeWidth={1.5} />
              <span className="text-sm font-light" style={{ color: '#818cf8' }}>{config.discordInviteUrl}</span>
            </div>
          )}
          <SaveBtn saving={saving} onClick={() => handleSave({ discordInviteUrl: config.discordInviteUrl ?? '' })} />
        </div>
      )}

      {activeTab === 'users' && (
        <div className="rounded-2xl overflow-hidden border" style={{ background: sf, borderColor: bd }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: bd }}>
            <div>
              <span className="text-sm font-light text-white">Usuarios Registrados</span>
              <span className="text-xs font-light ml-2" style={{ color: mt }}>{users.length} total</span>
            </div>
            <button onClick={loadData}
              className="w-8 h-8 rounded-xl flex items-center justify-center border transition-all hover:bg-white/[0.05]"
              style={{ borderColor: bd, color: mt }}>
              <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
          {users.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="w-8 h-8 mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.1)' }} strokeWidth={1} />
              <p className="text-sm font-light" style={{ color: mt }}>No hay usuarios registrados aún</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: bd }}>
                    {['Código', 'Nombre', 'Correo', 'Teléfono', 'Registrado', ''].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id} className="border-b transition-colors hover:bg-white/[0.02]" style={{ borderColor: bd }}>
                      <td className="py-3 px-4 font-mono text-xs" style={{ color: mt }}>{user.code ?? '—'}</td>
                      <td className="py-3 px-4 font-light text-white text-sm">{user.firstName} {user.lastName}</td>
                      <td className="py-3 px-4 font-light text-sm" style={{ color: mt }}>{user.email}</td>
                      <td className="py-3 px-4 font-light text-sm" style={{ color: mt }}>{user.phone}</td>
                      <td className="py-3 px-4 font-light text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{formatDate(user.registeredAt)}</td>
                      <td className="py-3 px-4">
                        <button onClick={() => handleDelete(user.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/10"
                          style={{ color: 'rgba(255,255,255,0.2)' }}
                          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#f87171'}
                          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.2)'}>
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   CORREO FEST PANEL — emails reales a Gmail via EmailJS
══════════════════════════════════════════════════════════════════════════════ */
const CorreoFestPanel: React.FC = () => {
  const [festUsers, setFestUsers]       = useState<FestUser[]>([]);
  const [loading, setLoading]           = useState(true);
  const [mode, setMode]                 = useState<'all' | 'one'>('all');
  const [selectedUser, setSelectedUser] = useState<FestUser | null>(null);
  const [userSearch, setUserSearch]     = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [subject, setSubject]           = useState('');
  const [body, setBody]                 = useState('');
  const [fromName, setFromName]         = useState('Moon Studios');
  const [sending, setSending]           = useState(false);
  const [progress, setProgress]         = useState({ current: 0, total: 0 });
  const [done, setDone]                 = useState(false);
  const [failedList, setFailedList]     = useState<{ name: string; email: string }[]>([]);
  const [formError, setFormError]       = useState('');

  const ejConfigured = !!(
    EJ_SERVICE  && EJ_SERVICE  !== 'undefined' &&
    EJ_TEMPLATE && EJ_TEMPLATE !== 'undefined' &&
    EJ_KEY      && EJ_KEY      !== 'undefined'
  );

  useEffect(() => {
    getDocs(USERS_COL)
      .then(snap => setFestUsers(snap.docs.map(d => ({ ...d.data(), id: d.id }) as FestUser)))
      .finally(() => setLoading(false));
  }, []);

  const recipients: FestUser[] = mode === 'all'
    ? festUsers
    : selectedUser ? [selectedUser] : [];

  const validRecipients = recipients.filter(u => u.email?.includes('@'));

  const filtered = festUsers.filter(u =>
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearch.toLowerCase())
  );

  const handleSend = async () => {
  setFormError('');
  setFailedList([]);
  setDone(false);

  if (!ejConfigured) { 
    setFormError('EmailJS no está configurado. Revisa las variables de entorno en .env'); 
    return; 
  }
  if (!subject.trim()) { 
    setFormError('El asunto es obligatorio.'); 
    return; 
  }
  if (!body.trim()) { 
    setFormError('El mensaje no puede estar vacío.'); 
    return; 
  }
  if (validRecipients.length === 0) { 
    setFormError('No hay destinatarios con email válido.'); 
    return; 
  }

  if (!confirm(`¿Enviar a ${validRecipients.length} destinatario${validRecipients.length !== 1 ? 's' : ''}?\nEsto enviará emails reales a sus cuentas de Gmail.`)) return;

  setSending(true);
  setProgress({ current: 0, total: validRecipients.length });

  const failed: { name: string; email: string }[] = [];

  for (let i = 0; i < validRecipients.length; i++) {
    const user = validRecipients[i];
    const fullName = `${user.firstName} ${user.lastName}`.trim();

    // DEBUG: Verificar valores antes de enviar
    console.log(`[EmailJS] Enviando a ${i + 1}/${validRecipients.length}:`, {
      to_email: user.email,
      to_name: fullName,
      subject: subject.trim(),
      message_preview: body.trim().substring(0, 50) + '...',
      from_name: fromName.trim() || 'Moon Studios',
    });

    try {
      // FORMA CORRECTA: Usar objeto con template_params explícito
      const templateParams = {
        to_email: user.email,
        to_name: fullName || user.email,
        subject: subject.trim(),
        message: body.trim(),
        from_name: fromName.trim() || 'Moon Studios',
      };

      await emailjs.send(
        EJ_SERVICE,      // serviceID: string
        EJ_TEMPLATE,     // templateID: string
        templateParams,  // templateParams: object
        EJ_KEY          // publicKey: string
      );

    } catch (err: any) {
      console.error(`[EmailJS] Error enviando a ${user.email}:`, err);
      console.error('[EmailJS] Error details:', {
        text: err?.text,
        status: err?.status,
      });
      failed.push({ name: fullName, email: user.email });
    }

    setProgress({ current: i + 1, total: validRecipients.length });
    
    // Rate limit: 1 req/segundo en plan gratuito
    if (i < validRecipients.length - 1) {
      await new Promise(r => setTimeout(r, 1000)); // Aumentado a 1s por seguridad
    }
  }

  setSending(false);
  setFailedList(failed);
  setDone(true);

  const sent = validRecipients.length - failed.length;
  if (sent > 0) {
    toast.success(`${sent} email${sent !== 1 ? 's' : ''} enviado${sent !== 1 ? 's' : ''} correctamente`);
    setSubject('');
    setBody('');
    setSelectedUser(null);
  }
  if (failed.length > 0) {
    toast.error(`${failed.length} email${failed.length !== 1 ? 's' : ''} no se pudo${failed.length !== 1 ? 'ieron' : ''} enviar`);
  }
};

  return (
    <div className="space-y-5">

      {/* Alerta EmailJS no configurado */}
      {!ejConfigured && (
        <div className="flex items-start gap-3 p-4 rounded-2xl"
          style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#fbbf24' }} strokeWidth={1.5} />
          <div className="space-y-1.5">
            <p className="text-sm font-light" style={{ color: '#fbbf24' }}>EmailJS no configurado</p>
            <p className="text-xs font-light leading-relaxed" style={{ color: 'rgba(251,191,36,0.6)' }}>
              Agrega en tu <code className="font-mono bg-black/20 px-1 py-0.5 rounded">.env</code>:
            </p>
            <div className="rounded-lg p-3 space-y-1" style={{ background: 'rgba(0,0,0,0.3)' }}>
              {[
                'VITE_EMAILJS_SERVICE_ID=service_xxxxxxx',
                'VITE_EMAILJS_TEMPLATE_ID=template_xxxxxxx',
                'VITE_EMAILJS_PUBLIC_KEY=xxxxxxxxxxxxxxx',
              ].map(line => (
                <p key={line} className="text-[11px] font-mono" style={{ color: 'rgba(251,191,36,0.5)' }}>{line}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Destinatarios */}
      <div className="rounded-2xl p-5 space-y-4" style={{ background: sf, border: `1px solid ${bd}` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AtSign className="w-4 h-4" style={{ color: mt }} strokeWidth={1.5} />
            <p className="text-sm font-light text-white">Destinatarios</p>
          </div>
          {!loading && (
            <span className="text-xs font-light px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(255,255,255,0.05)', color: mt }}>
              {festUsers.length} registrado{festUsers.length !== 1 ? 's' : ''} · {festUsers.filter(u => u.email?.includes('@')).length} con email
            </span>
          )}
        </div>

        {/* Mode selector */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: sc, border: `1px solid ${bd}` }}>
          {([
            { id: 'all' as const, label: 'Todos los registrados', icon: Users },
            { id: 'one' as const, label: 'Un usuario específico', icon: UserCheck },
          ]).map(({ id, label, icon: Icon }) => (
            <button key={id}
              onClick={() => { setMode(id); setSelectedUser(null); setUserSearch(''); }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-light transition-all"
              style={{
                background: mode === id ? 'rgba(255,255,255,0.08)' : 'transparent',
                color:      mode === id ? 'white' : mt,
              }}>
              <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
              {label}
            </button>
          ))}
        </div>

        {/* Todos */}
        {mode === 'all' && !loading && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
            style={{ background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.15)' }}>
            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#4ade80' }} strokeWidth={1.5} />
            <p className="text-xs font-light" style={{ color: '#4ade80' }}>
              Se enviará a <strong>{validRecipients.length}</strong> correos válidos de Gmail
            </p>
          </div>
        )}

        {/* Un usuario */}
        {mode === 'one' && (
          <div className="relative">
            {selectedUser ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background: sc, border: `1px solid ${bd}` }}>
                <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-light">
                    {selectedUser.firstName?.[0]?.toUpperCase() ?? '?'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-light truncate">
                    {selectedUser.firstName} {selectedUser.lastName}
                  </p>
                  <p className="text-xs font-light truncate" style={{ color: mt }}>{selectedUser.email}</p>
                </div>
                <button onClick={() => setSelectedUser(null)}
                  className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white/10 transition-colors"
                  style={{ color: mt }}>
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: mt }} strokeWidth={1.5} />
                  <input
                    value={userSearch}
                    onChange={e => { setUserSearch(e.target.value); setShowDropdown(true); }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                    placeholder="Buscar por nombre o email..."
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm font-light outline-none transition-all"
                    style={{ background: sc, border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' }}
                  />
                </div>
                {showDropdown && filtered.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-50 max-h-52 overflow-y-auto"
                    style={{ background: 'hsl(var(--card))', border: `1px solid ${bd}`, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                    {filtered.map(u => (
                      <button key={u.id}
                        onMouseDown={() => { setSelectedUser(u); setUserSearch(''); setShowDropdown(false); }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.05]"
                        style={{ borderBottom: `1px solid ${bd}` }}>
                        <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs">{u.firstName?.[0]?.toUpperCase() ?? '?'}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-light truncate">{u.firstName} {u.lastName}</p>
                          <p className="text-xs font-light truncate" style={{ color: mt }}>{u.email}</p>
                        </div>
                        {u.code && (
                          <span className="text-[10px] font-mono flex-shrink-0" style={{ color: 'rgba(255,255,255,0.2)' }}>{u.code}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Remitente */}
      <div className="rounded-2xl p-5 space-y-3" style={{ background: sf, border: `1px solid ${bd}` }}>
        <p className="text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>Nombre del remitente</p>
        <input
          value={fromName}
          onChange={e => setFromName(e.target.value)}
          placeholder="Moon Studios"
          maxLength={60}
          className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none transition-all"
          style={{ background: sc, border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' }}
          onFocus={e => e.target.style.borderColor = 'rgba(255,255,255,0.2)'}
          onBlur={e  => e.target.style.borderColor = bd}
        />
        <p className="text-[11px] font-light" style={{ color: 'rgba(255,255,255,0.18)' }}>
          Nombre visible para el destinatario en su bandeja de Gmail
        </p>
      </div>

      {/* Composición */}
      <div className="rounded-2xl overflow-hidden" style={{ background: sf, border: `1px solid ${bd}` }}>
        <div className="flex items-center gap-2.5 px-5 py-4 border-b" style={{ borderColor: bd }}>
          <Mail className="w-4 h-4" style={{ color: mt }} strokeWidth={1.5} />
          <p className="text-sm font-light text-white">Redactar email</p>
        </div>

        {/* Asunto */}
        <div className="px-5 pt-5 pb-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          <p className="text-[10px] uppercase tracking-widest font-light mb-2" style={{ color: mt }}>Asunto</p>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            maxLength={100}
            placeholder="Ej: ¡Bienvenido al Moon Studios Fest 2026!"
            className="w-full bg-transparent text-white text-sm font-light outline-none placeholder:opacity-25"
          />
          <div className="flex justify-end mt-2">
            <span className="text-[10px] font-light"
              style={{ color: subject.length > 85 ? '#f87171' : 'rgba(255,255,255,0.15)' }}>
              {subject.length}/100
            </span>
          </div>
        </div>

        {/* Cuerpo */}
        <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          <p className="text-[10px] uppercase tracking-widest font-light mb-2" style={{ color: mt }}>Mensaje</p>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={8}
            maxLength={3000}
            placeholder={"Escribe el contenido del email...\n\nPuedes incluir el link de Discord, detalles del evento, instrucciones para el día, etc."}
            className="w-full bg-transparent text-white text-sm font-light outline-none resize-none placeholder:opacity-20 leading-relaxed"
          />
          <div className="flex justify-end mt-1">
            <span className="text-[10px] font-light"
              style={{ color: body.length > 2700 ? '#f87171' : 'rgba(255,255,255,0.15)' }}>
              {body.length}/3000
            </span>
          </div>
        </div>

        {/* Barra de progreso */}
        {sending && progress.total > 0 && (
          <div className="px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-light" style={{ color: mt }}>
                Enviando {progress.current} de {progress.total}...
              </span>
              <span className="text-xs font-light" style={{ color: mt }}>
                {Math.round((progress.current / progress.total) * 100)}%
              </span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-full rounded-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%`, background: '#818cf8' }} />
            </div>
          </div>
        )}

        {/* Resultado */}
        {done && !sending && (
          <div className="px-5 py-4 border-b space-y-2" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5" style={{ color: '#4ade80' }} strokeWidth={1.5} />
              <p className="text-xs font-light" style={{ color: '#4ade80' }}>
                {progress.total - failedList.length} email{progress.total - failedList.length !== 1 ? 's' : ''} enviado{progress.total - failedList.length !== 1 ? 's' : ''}
              </p>
            </div>
            {failedList.length > 0 && (
              <div className="rounded-xl p-3 space-y-1.5"
                style={{ background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.15)' }}>
                <p className="text-xs font-light" style={{ color: '#f87171' }}>
                  {failedList.length} fallo{failedList.length !== 1 ? 's' : ''}:
                </p>
                {failedList.map((e, i) => (
                  <p key={i} className="text-[11px] font-mono" style={{ color: 'rgba(248,113,113,0.65)' }}>
                    {e.name} — {e.email}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            {formError && (
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#f87171' }} strokeWidth={1.5} />
                <p className="text-xs font-light" style={{ color: '#f87171' }}>{formError}</p>
              </div>
            )}
          </div>
          <button
            onClick={handleSend}
            disabled={sending || validRecipients.length === 0 || !subject.trim() || !body.trim() || !ejConfigured}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-light transition-all disabled:opacity-40 hover:opacity-90"
            style={{ background: '#fff', color: '#000' }}>
            {sending
              ? <><Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />Enviando {progress.current}/{progress.total}</>
              : <><Send className="w-4 h-4" strokeWidth={1.5} />Enviar{validRecipients.length > 0 ? ` (${validRecipients.length})` : ''}</>
            }
          </button>
        </div>
      </div>

      <p className="text-[11px] font-light text-center" style={{ color: 'rgba(255,255,255,0.15)' }}>
        Plan gratuito EmailJS: 200 emails/mes · Los emails llegan directamente al Gmail del registrado
      </p>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   WEBS (principal)
══════════════════════════════════════════════════════════════════════════════ */
const WEBS_LIST = [
  { id: 'moon-fest', name: 'Moon Studios Fest', url: 'https://moon-studios-fest.netlify.app', status: 'live' as const },
];

const Webs = () => {
  const [selected, setSelected] = useState<string | null>(null);

  const openUrl = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)' }}>
            <Globe className="w-4 h-4" style={{ color: '#4ade80' }} strokeWidth={1.5} />
          </div>
          <h1 className="text-xl font-light text-white tracking-tight">Webs</h1>
        </div>
        <p className="text-sm font-light" style={{ color: mt }}>Administra los sitios web y comunicaciones de Moon Studios</p>
      </div>

      {/* Sitios */}
      <div>
        <p className="text-[10px] uppercase tracking-widest font-light mb-3" style={{ color: mt }}>Sitios web</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {WEBS_LIST.map(web => (
            <button key={web.id} onClick={() => setSelected(selected === web.id ? null : web.id)}
              className="p-4 rounded-2xl border text-left transition-all hover:brightness-110"
              style={{
                background: selected === web.id ? 'rgba(255,255,255,0.07)' : 'hsl(var(--card))',
                border: `1px solid ${selected === web.id ? 'rgba(255,255,255,0.15)' : bd}`,
                boxShadow: selected === web.id ? '0 0 0 1px rgba(255,255,255,0.06)' : 'none',
              }}>
              <div className="flex items-center justify-between mb-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${bd}` }}>
                  <Globe className="w-4 h-4" style={{ color: mt }} strokeWidth={1.5} />
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${web.status === 'live' ? 'bg-green-400' : 'bg-zinc-500'}`}
                    style={{ animation: web.status === 'live' ? 'pulse 2s infinite' : 'none' }} />
                  <button onClick={e => openUrl(e, web.url)} className="transition-colors hover:text-white" style={{ color: mt }}>
                    <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
              <p className="text-white text-sm font-light">{web.name}</p>
              <p className="text-xs font-light mt-0.5 truncate" style={{ color: mt }}>{web.url}</p>
            </button>
          ))}
        </div>
      </div>

      {selected === 'moon-fest' && (
        <div className="rounded-2xl overflow-hidden border" style={{ borderColor: bd }}>
          <div className="px-5 py-4 border-b flex items-center gap-2"
            style={{ background: 'hsl(var(--card))', borderColor: bd }}>
            <Globe className="w-4 h-4" style={{ color: mt }} strokeWidth={1.5} />
            <span className="text-sm font-light text-white">Moon Studios Fest — Administración</span>
          </div>
          <div className="p-5"><MoonFestPanel /></div>
        </div>
      )}

      {/* Comunicaciones */}
      <div>
        <p className="text-[10px] uppercase tracking-widest font-light mb-3" style={{ color: mt }}>Comunicaciones</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button onClick={() => setSelected(selected === 'correo' ? null : 'correo')}
            className="p-4 rounded-2xl border text-left transition-all hover:brightness-110"
            style={{
              background: selected === 'correo' ? 'rgba(99,102,241,0.08)' : 'hsl(var(--card))',
              border: `1px solid ${selected === 'correo' ? 'rgba(99,102,241,0.25)' : bd}`,
              boxShadow: selected === 'correo' ? '0 0 0 1px rgba(99,102,241,0.1)' : 'none',
            }}>
            <div className="flex items-center justify-between mb-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <Mail className="w-4 h-4" style={{ color: '#818cf8' }} strokeWidth={1.5} />
              </div>
              {selected === 'correo' && (
                <X className="w-4 h-4" style={{ color: 'rgba(148,151,248,0.5)' }} strokeWidth={1.5} />
              )}
            </div>
            <p className="text-white text-sm font-light">Enviar Correo</p>
            <p className="text-xs font-light mt-0.5" style={{ color: mt }}>Emails reales a los registrados del Fest</p>
          </button>
        </div>
      </div>

      {selected === 'correo' && (
        <div className="rounded-2xl overflow-hidden border" style={{ borderColor: 'rgba(99,102,241,0.2)' }}>
          <div className="px-5 py-4 border-b flex items-center gap-2.5"
            style={{ background: 'hsl(var(--card))', borderColor: 'rgba(99,102,241,0.15)' }}>
            <div className="w-6 h-6 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <Mail className="w-3.5 h-3.5" style={{ color: '#818cf8' }} strokeWidth={1.5} />
            </div>
            <span className="text-sm font-light text-white">Correo Masivo — Moon Fest 2026</span>
            <span className="ml-auto text-[10px] font-light px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(99,102,241,0.08)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.15)' }}>
              Gmail · EmailJS
            </span>
          </div>
          <div className="p-5"><CorreoFestPanel /></div>
        </div>
      )}
    </div>
  );
};

export default Webs;