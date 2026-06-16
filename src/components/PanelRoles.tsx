import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db } from '@/lib/firebase';
import {
  collection, doc, updateDoc, onSnapshot,
  query, orderBy,
} from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_PERMISSIONS } from '@/types';
import type { UserRole, Permission } from '@/types';
import { Users, Shield, ChevronDown, Search, Check, AlertCircle } from 'lucide-react';

// ─── Configuración visual de roles ────────────────────────────────────────────
const ROLE_META: Record<UserRole, { color: string; bg: string; description: string }> = {
  CEO:           { color: '#f59e0b', bg: '#f59e0b18', description: 'Acceso total al sistema' },
  Administración:{ color: '#60a5fa', bg: '#60a5fa18', description: 'Gestión y supervisión general' },
  Diseño:        { color: '#a78bfa', bg: '#a78bfa18', description: 'Panel de diseño gráfico y multimedia' },
  Secretaría:    { color: '#34d399', bg: '#34d39918', description: 'Documentos, agenda y actividades' },
  Programación:  { color: '#f472b6', bg: '#f472b618', description: 'Proyectos y control de versiones' },
  Contador:      { color: '#fb923c', bg: '#fb923c18', description: 'Contabilidad y libro diario' },
  Empleado:      { color: '#6b7280', bg: '#6b728018', description: 'Acceso básico al dashboard' },
};

const ALL_ROLES: UserRole[] = [
  'CEO', 'Administración', 'Diseño', 'Secretaría', 'Programación', 'Contador', 'Empleado',
];

const PERMISSION_LABELS: Record<Permission, string> = {
  roles:        'Gestión de roles',
  admin:        'Panel de administración',
  diseno:       'Panel de diseño',
  secretaria:   'Panel de secretaría',
  programacion: 'Panel de programación',
  contador:     'Contabilidad',
  webs:         'Gestión de webs',
  ceo:          'Panel CEO',
};

interface UserDoc {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  avatar?: string;
  createdAt: any;
}

type Toast = { type: 'success' | 'error'; msg: string } | null;

export default function PanelRoles() {
  const { userProfile } = useAuth();
  const [users,       setUsers]       = useState<UserDoc[]>([]);
  const [search,      setSearch]      = useState('');
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState<string | null>(null);
  const [toast,       setToast]       = useState<Toast>(null);
  const [activeTab,   setActiveTab]   = useState<'usuarios' | 'permisos'>('usuarios');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [dropdownPos,  setDropdownPos]  = useState<{ top: number; right: number } | null>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // ── Cargar usuarios ──────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('displayName'));
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserDoc));
      setUsers(docs);
      setLoading(false);
    }, err => {
      console.error('Error cargando usuarios:', err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Cambiar rol ──────────────────────────────────────────────────────────
  const handleRoleChange = async (uid: string, newRole: UserRole) => {
    if (uid === userProfile?.uid) {
      showToast('error', 'No puedes cambiar tu propio rol');
      return;
    }
    setSaving(uid);
    setOpenDropdown(null);
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
      showToast('success', 'Rol actualizado correctamente');
    } catch (err: any) {
      showToast('error', `Error: ${err.message}`);
    } finally {
      setSaving(null);
    }
  };

  const filtered = users.filter(u =>
    u.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.role?.toLowerCase().includes(search.toLowerCase())
  );

  // ── Stats por rol ────────────────────────────────────────────────────────
  const countByRole = ALL_ROLES.reduce((acc, role) => {
    acc[role] = users.filter(u => u.role === role).length;
    return acc;
  }, {} as Record<UserRole, number>);

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* ── Toast ── */}
      {toast && (
        <div
          className={`fixed top-20 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl border text-sm font-light shadow-2xl transition-all`}
          style={{
            background: toast.type === 'success' ? 'rgba(20,30,20,0.97)' : 'rgba(30,15,15,0.97)',
            borderColor: toast.type === 'success' ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)',
            color: toast.type === 'success' ? '#34d399' : '#f87171',
          }}
        >
          {toast.type === 'success'
            ? <Check className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
            : <AlertCircle className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />}
          {toast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <div>
        <h1 className="text-white text-xl font-light tracking-wide mb-1">Gestión de Roles</h1>
        <p className="text-zinc-500 text-sm font-light">
          Asigna roles a los usuarios. Los permisos se aplican automáticamente según el rol.
        </p>
      </div>

      {/* ── Stats por rol ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ALL_ROLES.filter(r => r !== 'CEO').map(role => {
          const meta = ROLE_META[role];
          return (
            <div key={role}
              className="rounded-2xl border p-4"
              style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.07)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-light tracking-wide" style={{ color: meta.color }}>{role}</span>
                <span className="text-lg font-light text-white">{countByRole[role]}</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden bg-zinc-900">
                <div className="h-full rounded-full transition-all" style={{
                  width: users.length > 0 ? `${(countByRole[role] / users.length) * 100}%` : '0%',
                  background: meta.color,
                }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {(['usuarios', 'permisos'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className="flex-1 py-2 rounded-xl text-sm font-light capitalize transition-all"
            style={{
              background: activeTab === tab ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: activeTab === tab ? '#fff' : '#555',
            }}>
            {tab === 'usuarios' ? `Usuarios (${users.length})` : 'Matriz de Permisos'}
          </button>
        ))}
      </div>

      {/* ════ TAB: USUARIOS ════ */}
      {activeTab === 'usuarios' && (
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" strokeWidth={1.5} />
            <input
              type="text"
              placeholder="Buscar por nombre, email o rol..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-2xl text-sm font-light text-white placeholder-zinc-600 outline-none"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
            />
          </div>

          {/* Tabla */}
          <div className="rounded-2xl" style={{ border: '1px solid rgba(255,255,255,0.07)', overflow: 'visible' }}>
            {loading ? (
              <div className="py-16 flex items-center justify-center">
                <div className="w-6 h-6 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <Users className="w-8 h-8 text-zinc-700 mx-auto mb-3" strokeWidth={1} />
                <p className="text-zinc-600 text-sm font-light">No se encontraron usuarios</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-900/60">
                {/* Header */}
                <div className="grid grid-cols-12 gap-4 px-5 py-3"
                  style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '16px 16px 0 0' }}>
                  <span className="col-span-5 text-zinc-600 text-xs font-light uppercase tracking-wider">Usuario</span>
                  <span className="col-span-4 text-zinc-600 text-xs font-light uppercase tracking-wider">Rol actual</span>
                  <span className="col-span-3 text-zinc-600 text-xs font-light uppercase tracking-wider">Cambiar rol</span>
                </div>

                {filtered.map(user => {
                  const meta    = ROLE_META[user.role] ?? ROLE_META.Empleado;
                  const isSelf  = user.uid === userProfile?.uid;
                  const isBusy  = saving === user.uid;
                  const isOpen  = openDropdown === user.uid;

                  return (
                    <div key={user.uid}
                      className="grid grid-cols-12 gap-4 px-5 py-4 items-center hover:bg-white/[0.015] transition-colors">
                      {/* Avatar + nombre */}
                      <div className="col-span-5 flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700/50 flex items-center justify-center flex-shrink-0">
                          {user.avatar ? (
                            <img src={user.avatar} alt={user.displayName} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-white text-xs font-light">
                              {(user.displayName ?? 'U').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-white text-sm font-light truncate">
                            {user.displayName}
                            {isSelf && <span className="ml-2 text-zinc-600 text-xs">(tú)</span>}
                          </p>
                          <p className="text-zinc-600 text-xs font-light truncate">{user.email}</p>
                        </div>
                      </div>

                      {/* Rol actual badge */}
                      <div className="col-span-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-light"
                          style={{ color: meta.color, background: meta.bg }}>
                          <Shield className="w-3 h-3" strokeWidth={1.5} />
                          {user.role}
                        </span>
                      </div>

                      {/* Dropdown para cambiar rol */}
                      <div className="col-span-3 relative">
                        {isSelf || user.role === 'CEO' ? (
                          <span className="text-zinc-700 text-xs font-light">—</span>
                        ) : (
                          <>
                            <button
                              ref={el => { buttonRefs.current[user.uid] = el; }}
                              onClick={() => {
                                if (isOpen) {
                                  setOpenDropdown(null);
                                  setDropdownPos(null);
                                } else {
                                  const btn = buttonRefs.current[user.uid];
                                  if (btn) {
                                    const rect = btn.getBoundingClientRect();
                                    setDropdownPos({
                                      top:   rect.bottom + 6,
                                      right: window.innerWidth - rect.right,
                                    });
                                  }
                                  setOpenDropdown(user.uid);
                                }
                              }}
                              disabled={isBusy}
                              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-light transition-all"
                              style={{
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                color: isBusy ? '#444' : '#aaa',
                                cursor: isBusy ? 'not-allowed' : 'pointer',
                              }}>
                              {isBusy ? (
                                <div className="w-3 h-3 border border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
                              ) : (
                                <>Cambiar <ChevronDown className="w-3 h-3" strokeWidth={1.5} /></>
                              )}
                            </button>

                            {isOpen && dropdownPos && createPortal(
                              <>
                                <div className="fixed inset-0" style={{ zIndex: 9998 }}
                                  onClick={() => { setOpenDropdown(null); setDropdownPos(null); }} />
                                <div className="fixed rounded-2xl overflow-hidden shadow-2xl"
                                  style={{
                                    top:         dropdownPos.top,
                                    right:        dropdownPos.right,
                                    zIndex:       9999,
                                    width:        '192px',
                                    background:   '#0d0d0d',
                                    border:       '1px solid rgba(255,255,255,0.1)',
                                    boxShadow:    '0 24px 60px rgba(0,0,0,0.8)',
                                  }}>
                                  {ALL_ROLES.filter(r => r !== 'CEO' && r !== user.role).map(role => {
                                    const m = ROLE_META[role];
                                    return (
                                      <button key={role}
                                        onClick={() => { handleRoleChange(user.uid, role); setDropdownPos(null); }}
                                        className="w-full flex items-center gap-2.5 px-4 py-3 text-left text-sm font-light hover:bg-white/[0.05] transition-colors"
                                        style={{ color: m.color }}>
                                        <Shield className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
                                        {role}
                                      </button>
                                    );
                                  })}
                                </div>
                              </>,
                              document.body
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════ TAB: PERMISOS ════ */}
      {activeTab === 'permisos' && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <th className="text-left px-5 py-3 text-zinc-600 text-xs font-light uppercase tracking-wider">
                    Permiso / Rol
                  </th>
                  {ALL_ROLES.map(role => {
                    const meta = ROLE_META[role];
                    return (
                      <th key={role} className="px-4 py-3 text-center">
                        <span className="text-xs font-light" style={{ color: meta.color }}>{role}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/50">
                {(Object.keys(PERMISSION_LABELS) as Permission[]).map(perm => (
                  <tr key={perm} className="hover:bg-white/[0.015] transition-colors">
                    <td className="px-5 py-3.5 text-zinc-400 text-sm font-light">
                      {PERMISSION_LABELS[perm]}
                    </td>
                    {ALL_ROLES.map(role => {
                      const has = ROLE_PERMISSIONS[role]?.includes(perm);
                      return (
                        <td key={role} className="px-4 py-3.5 text-center">
                          {has ? (
                            <Check className="w-4 h-4 text-emerald-500 mx-auto" strokeWidth={2} />
                          ) : (
                            <span className="w-4 h-4 mx-auto block text-center text-zinc-800">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Leyenda */}
          <div className="px-5 py-4 border-t border-zinc-900/60 flex flex-wrap gap-3">
            {ALL_ROLES.map(role => {
              const meta = ROLE_META[role];
              return (
                <div key={role} className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: meta.color }} />
                  <div>
                    <span className="text-xs font-light" style={{ color: meta.color }}>{role}</span>
                    <span className="text-zinc-700 text-xs ml-1 hidden sm:inline">— {meta.description}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}