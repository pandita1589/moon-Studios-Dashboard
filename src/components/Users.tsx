import React, { useState, useEffect } from 'react';
import { registerUser, createUserProfile, db } from '@/lib/firebase';
import { collection, getDocs, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users as UsersIcon, Plus, Trash2, Edit2, User, Crown, Shield, Briefcase, Calculator, Palette, ClipboardList, Code2 } from 'lucide-react';
import type { UserProfile, UserRole } from '@/types';

const bd = 'hsl(var(--border))';
const sf = 'hsl(var(--card))';
const mt = 'hsl(var(--muted-foreground))';

const ROLE_CONFIG: Record<UserRole, { label: string; color: string; bg: string; icon: React.FC<any> }> = {
  CEO:            { label: 'CEO',            color: '#c084fc', bg: 'rgba(192,132,252,0.1)', icon: Crown         },
  Administración: { label: 'Administración', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  icon: Shield        },
  Empleado:       { label: 'Empleado',       color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', icon: Briefcase     },
  Contador:       { label: 'Contador',       color: '#34d399', bg: 'rgba(52,211,153,0.1)',  icon: Calculator    },
  Diseño:         { label: 'Diseño',         color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', icon: Palette       },
  Secretaría:     { label: 'Secretaría',     color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  icon: ClipboardList },
  Programación:   { label: 'Programación',   color: '#f472b6', bg: 'rgba(244,114,182,0.1)', icon: Code2         },
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <label className="text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>{label}</label>
    {children}
  </div>
);

const StyledInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input
    {...props}
    className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none transition-all"
    style={{
      background: 'hsl(var(--secondary))',
      border: `1px solid ${bd}`,
      color: 'hsl(var(--foreground))',
    }}
    onFocus={e => e.target.style.borderColor = 'rgba(255,255,255,0.2)'}
    onBlur={e  => e.target.style.borderColor = bd}
  />
);

const Users: React.FC = () => {
  const [users,       setUsers]       = useState<UserProfile[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [createOpen,  setCreateOpen]  = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [error,       setError]       = useState('');

  const [form, setForm] = useState({ email: '', password: '', displayName: '', role: 'Empleado' as UserRole });

  const load = async () => {
    try {
      const snap = await getDocs(collection(db, 'users'));
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() })) as UserProfile[]);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => setForm({ email: '', password: '', displayName: '', role: 'Empleado' });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const cred = await registerUser(form.email, form.password);
      await createUserProfile(cred.user.uid, { email: form.email, displayName: form.displayName, role: form.role });
      resetForm();
      setCreateOpen(false);
      load();
    } catch {
      setError('Error al crear. Verifica que el email no esté en uso.');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      await updateDoc(doc(db, 'users', editingUser.uid), { displayName: form.displayName, role: form.role });
      setEditingUser(null);
      resetForm();
      load();
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (uid: string) => {
    if (!confirm('¿Eliminar este usuario?')) return;
    try { await deleteDoc(doc(db, 'users', uid)); load(); }
    catch (e) { console.error(e); }
  };

  const startEdit = (u: UserProfile) => {
    setEditingUser(u);
    setForm({ email: u.email, password: '', displayName: u.displayName, role: u.role });
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-7 h-7 border border-zinc-700 border-t-zinc-300 rounded-full animate-spin" />
    </div>
  );

  const FormDialog = ({ open, onClose, onSubmit, title, isEdit }: any) => (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent style={{ background: sf, border: `1px solid ${bd}`, borderRadius: '20px', maxWidth: '420px' }}>
        <DialogHeader>
          <DialogTitle className="text-white font-light text-base">{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 mt-2">
          <Field label="Nombre completo">
            <StyledInput value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} required placeholder="Juan García" />
          </Field>
          {!isEdit && (
            <>
              <Field label="Correo electrónico">
                <StyledInput type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required placeholder="juan@moon.com" />
              </Field>
              <Field label="Contraseña">
                <StyledInput type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={6} placeholder="••••••••" />
              </Field>
            </>
          )}
          <Field label="Rol">
            <Select value={form.role} onValueChange={(v: UserRole) => setForm(f => ({ ...f, role: v }))}>
              <SelectTrigger className="rounded-xl font-light" style={{ background: 'hsl(var(--secondary))', border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent style={{ background: 'hsl(var(--card))', border: `1px solid ${bd}`, borderRadius: '14px' }}>
                {(['CEO', 'Administración', 'Empleado', 'Contador', 'Diseño', 'Secretaría', 'Programación'] as UserRole[]).map(r => (
                  <SelectItem key={r} value={r} className="font-light">{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {error && <p className="text-red-400 text-xs font-light">{error}</p>}
          <button type="submit" className="w-full py-2.5 rounded-xl text-sm font-light transition-all hover:opacity-90"
            style={{ background: '#fff', color: '#000' }}>
            {isEdit ? 'Guardar Cambios' : 'Crear Usuario'}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}>
              <UsersIcon className="w-4 h-4" style={{ color: '#60a5fa' }} strokeWidth={1.5} />
            </div>
            <h1 className="text-xl font-light text-white tracking-tight">Usuarios</h1>
          </div>
          <p className="text-sm font-light" style={{ color: mt }}>{users.length} usuario{users.length !== 1 ? 's' : ''} registrado{users.length !== 1 ? 's' : ''}</p>
        </div>
        <Dialog open={createOpen} onOpenChange={o => { setCreateOpen(o); if (!o) { resetForm(); setError(''); } }}>
          <DialogTrigger asChild>
            <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-light transition-all hover:opacity-90"
              style={{ background: '#fff', color: '#000' }}>
              <Plus className="w-4 h-4" strokeWidth={1.5} />
              Nuevo Usuario
            </button>
          </DialogTrigger>
        </Dialog>
      </div>

      {/* Users list */}
      {users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl border-2 border-dashed" style={{ borderColor: bd }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
            style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${bd}` }}>
            <User className="w-5 h-5" style={{ color: mt }} strokeWidth={1} />
          </div>
          <p className="text-sm font-light" style={{ color: mt }}>No hay usuarios registrados</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden border" style={{ background: sf, borderColor: bd }}>
          <div className="divide-y" style={{ borderColor: bd }}>
            {users.map((u, i) => {
              const rc   = ROLE_CONFIG[u.role] ?? ROLE_CONFIG.Empleado;
              const RIcon = rc.icon;
              const initials = u.displayName?.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() ?? '?';
              return (
                <div key={u.uid}
                  className="flex items-center justify-between p-4 transition-colors hover:bg-white/[0.02] gap-4"
                  style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center"
                      style={{ background: 'hsl(var(--muted))', border: `1px solid ${bd}` }}>
                      {u.avatar
                        ? <img src={u.avatar} alt={u.displayName} className="w-full h-full object-cover" />
                        : <span className="text-white text-xs font-light">{initials}</span>
                      }
                    </div>
                    {/* Info */}
                    <div className="min-w-0">
                      <p className="text-white text-sm font-light truncate">{u.displayName}</p>
                      <p className="text-xs font-light truncate" style={{ color: mt }}>{u.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {/* Role badge */}
                    <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-light px-2.5 py-1 rounded-full"
                      style={{ color: rc.color, background: rc.bg }}>
                      <RIcon className="w-3 h-3" strokeWidth={1.5} />
                      {rc.label}
                    </span>
                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEdit(u)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:bg-white/[0.06]"
                        style={{ color: mt }}>
                        <Edit2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                      <button onClick={() => handleDelete(u.uid)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:bg-red-500/10"
                        style={{ color: mt }}
                        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#f87171'}
                        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = mt}>
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <FormDialog open={createOpen} onClose={(o: boolean) => { setCreateOpen(o); if (!o) { resetForm(); setError(''); }}} onSubmit={handleCreate} title="Crear Usuario" isEdit={false} />
      <FormDialog open={!!editingUser} onClose={(o: boolean) => { if (!o) { setEditingUser(null); resetForm(); }}} onSubmit={handleUpdate} title="Editar Usuario" isEdit />
    </div>
  );
};

export default Users;