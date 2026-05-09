import { unlockAudio } from '@/lib/notificationSound';
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { Outlet, useNavigate, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { logoutUser } from '@/lib/firebase';
import { useNotifications } from '@/hooks/useNotifications';
import { useTabSync } from '@/hooks/useTabSync';
import { useAutoLogout } from '@/hooks/useAutoLogout';
import { useIsMobile } from '@/hooks/use-mobile';
import { TabSyncModal, AutoLogoutModal, SESSION_MODAL_STYLES } from '@/components/SessionModals';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  LayoutDashboard, Calendar, Megaphone, Bot, Bell,
  Settings, LogOut, Moon, Crown, ChevronLeft, ChevronRight,
  AlertCircle, X, Mail, MessagesSquare, GitBranch, MessageSquare,
  Calculator, Globe, Menu, Code2, Palette, FileText, UserCog, ShieldCheck,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { NotifCategory } from '@/hooks/useNotifications';

// ── Categorías de notificación ────────────────────────────────────────────────
const CATEGORY_ICON: Record<NotifCategory, React.FC<any>> = {
  announcement: Megaphone, email: Mail, thread: GitBranch, message: MessageSquare,
};
const CATEGORY_LABEL: Record<NotifCategory, string> = {
  announcement: 'Anuncio', email: 'Correo', thread: 'Hilo', message: 'Mensaje',
};
const CATEGORY_COLOR: Record<NotifCategory, string> = {
  announcement: '#a78bfa', email: '#60a5fa', thread: '#34d399', message: '#fb923c',
};

// ── Animaciones y estilos globales ────────────────────────────────────────────
const GLOBAL_STYLES = `
  @keyframes _loOverlayIn { from{opacity:0} to{opacity:1} }
  @keyframes _loCardIn {
    from { opacity:0; transform:translateY(16px) scale(0.96); }
    to   { opacity:1; transform:translateY(0)    scale(1);   }
  }
  @keyframes _loCardOut {
    from { opacity:1; transform:scale(1);    filter:blur(0px); }
    to   { opacity:0; transform:scale(0.93); filter:blur(4px); }
  }
  @keyframes _loBar { from{width:0%} to{width:100%} }
  @keyframes _loPageOut {
    0%   { opacity:1; transform:scale(1);     filter:blur(0px);  }
    100% { opacity:0; transform:scale(1.015); filter:blur(10px); }
  }
  @keyframes _loDot {
    0%,80%,100% { opacity:0.15; transform:scale(0.75); }
    40%          { opacity:1;   transform:scale(1);    }
  }
  @keyframes slideInRight {
    from { opacity:0; transform:translateX(24px); }
    to   { opacity:1; transform:translateX(0); }
  }
  @keyframes slideInUp {
    from { opacity:0; transform:translateY(16px); }
    to   { opacity:1; transform:translateY(0); }
  }
  .__lo_overlay  { animation:_loOverlayIn 0.25s ease forwards; }
  .__lo_card_in  { animation:_loCardIn 0.32s cubic-bezier(0.22,1,0.36,1) forwards; }
  .__lo_card_out { animation:_loCardOut 0.22s ease-in forwards; }
  .__lo_bar      { animation:_loBar 1.7s cubic-bezier(0.4,0,0.15,1) forwards; }
  .__lo_page     { animation:_loPageOut 0.55s ease forwards; }
  .__lo_dot      { display:inline-block; }
  .__lo_dot:nth-child(1){ animation:_loDot 1.1s ease-in-out 0s    infinite; }
  .__lo_dot:nth-child(2){ animation:_loDot 1.1s ease-in-out 0.18s infinite; }
  .__lo_dot:nth-child(3){ animation:_loDot 1.1s ease-in-out 0.36s infinite; }

  .notif-panel-enter { animation: slideInRight 0.22s cubic-bezier(0.22,1,0.36,1) forwards; }

  .nav-item-active {
    background: rgba(255,255,255,0.08);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
  }
  html.light .nav-item-active {
    background: rgba(0,0,0,0.07);
    box-shadow: inset 0 0 0 1px rgba(0,0,0,0.05);
  }

  .bottom-nav-safe {
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  .main-scroll {
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.08) transparent;
  }
  .main-scroll::-webkit-scrollbar { width: 4px; }
  .main-scroll::-webkit-scrollbar-track { background: transparent; }
  .main-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 4px; }
`;

// ── Clock ─────────────────────────────────────────────────────────────────────
const Clock: React.FC<{ isMobile: boolean }> = memo(({ isMobile }) => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div>
      <h1 className="text-theme-primary font-light text-xs md:text-sm tracking-widest uppercase truncate">
        {format(time, isMobile ? 'EEE, d MMM' : 'EEEE, d MMMM yyyy', { locale: es })}
      </h1>
      <p className="text-theme-muted text-[10px] md:text-xs font-light tracking-widest">
        {format(time, 'HH:mm:ss')}
      </p>
    </div>
  );
});
Clock.displayName = 'Clock';

// ── LogoutModal — siempre via portal a document.body para escapar overflow:hidden ──
interface LogoutModalProps {
  phase: 'confirming' | 'leaving';
  onCancel: () => void;
  onConfirm: () => void;
  cardClass: string;
  userName: string;
}
const LogoutModal: React.FC<LogoutModalProps> = ({ phase, onCancel, onConfirm, cardClass, userName }) =>
  createPortal(
    <div
      className="__lo_overlay fixed inset-0 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(16px)', zIndex: 99999 }}
    >
      <div
        className={`${cardClass} relative w-full max-w-[320px]`}
        style={{
          background: 'rgba(10,10,10,0.97)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '20px',
          boxShadow: '0 40px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03)',
          overflow: 'hidden',
        }}
      >
        {phase === 'leaving' && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'rgba(255,255,255,0.04)' }}>
            <div className="__lo_bar" style={{ height: '100%', background: 'linear-gradient(90deg,#444,#fff,#444)' }} />
          </div>
        )}
        <div style={{ padding: '32px 28px 28px' }}>
          {phase === 'confirming' ? (
            <>
              <div style={{ marginBottom: '20px' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '14px',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <LogOut style={{ width: '18px', height: '18px', color: '#555' }} strokeWidth={1.5} />
                </div>
              </div>
              <p style={{ color: '#e0e0e0', fontSize: '15px', fontWeight: 300, marginBottom: '6px' }}>¿Cerrar sesión?</p>
              <p style={{ color: '#3a3a3a', fontSize: '12px', fontWeight: 300, marginBottom: '28px', lineHeight: 1.6 }}>
                Saldrás como <span style={{ color: '#555' }}>{userName}</span>
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={onCancel}
                  style={{ flex: 1, padding: '11px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#555', fontSize: '12px', fontWeight: 300, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', transition: 'background 0.2s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)'; }}
                >
                  Cancelar
                </button>
                <button
                  onClick={onConfirm}
                  style={{ flex: 1, padding: '11px', borderRadius: '12px', background: '#fff', border: 'none', color: '#000', fontSize: '12px', fontWeight: 400, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', transition: 'background 0.2s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#e0e0e0'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
                >
                  Salir
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LogOut style={{ width: '18px', height: '18px', color: '#444' }} strokeWidth={1.5} />
                </div>
              </div>
              <p style={{ color: '#444', fontSize: '11px', fontWeight: 300, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: '12px' }}>Cerrando sesión</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '5px' }}>
                {[0, 1, 2].map(i => (
                  <span key={i} className="__lo_dot" style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#444' }} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );

// ── NotifPanel ────────────────────────────────────────────────────────────────
interface NotifPanelProps {
  isMobile: boolean;
  notifications: any[];
  unreadCount: number;
  readIds: Set<string>;
  markOneRead: (id: string) => void;
  markAllRead: () => void;
  onClose: () => void;
  onNavigate: (path: string) => void;
}

const NotifPanel: React.FC<NotifPanelProps> = memo(({
  isMobile, notifications, unreadCount, readIds,
  markOneRead, markAllRead, onClose, onNavigate,
}) => createPortal(
  <div
    className="notif-panel-enter fixed rounded-2xl bg-zinc-950 border border-zinc-800/60 overflow-hidden flex flex-col"
    style={{
      top: isMobile ? '60px' : '68px',
      right: isMobile ? '12px' : '16px',
      width: isMobile ? 'calc(100vw - 24px)' : '24rem',
      maxWidth: '24rem',
      maxHeight: '75vh',
      zIndex: 9990,
      boxShadow: '0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)',
    }}
  >
    {/* Header */}
    <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-800/60 flex-shrink-0">
      <div className="flex items-center gap-2.5">
        <span className="text-white text-sm font-light tracking-wide">Notificaciones</span>
        {unreadCount > 0 && (
          <span className="text-[11px] bg-white/[0.07] text-zinc-400 px-2 py-0.5 rounded-full font-light">
            {unreadCount} sin leer
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="text-zinc-500 hover:text-zinc-300 text-xs font-light transition-colors">
            Marcar leídas
          </button>
        )}
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg bg-zinc-900 hover:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-all"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    {/* Category filters */}
    <div className="flex items-center gap-1 px-3 py-2 border-b border-zinc-900/60 flex-shrink-0">
      {(Object.keys(CATEGORY_LABEL) as NotifCategory[]).map(cat => {
        const n = notifications.filter((x: any) => x.category === cat && !readIds.has(x.id)).length;
        const Icon = CATEGORY_ICON[cat];
        return (
          <div key={cat} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-light"
            style={{ color: n > 0 ? CATEGORY_COLOR[cat] : '#3a3a3a', background: n > 0 ? `${CATEGORY_COLOR[cat]}12` : 'transparent' }}>
            <Icon className="w-3 h-3" strokeWidth={1.5} />
            {n > 0 && <span>{n}</span>}
          </div>
        );
      })}
    </div>

    {/* List */}
    <div className="flex-1 overflow-y-auto divide-y divide-zinc-900/40">
      {notifications.length === 0 ? (
        <div className="py-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 flex items-center justify-center mx-auto mb-3">
            <Bell className="w-5 h-5 text-zinc-700" strokeWidth={1.5} />
          </div>
          <p className="text-zinc-600 text-xs font-light">Sin notificaciones</p>
        </div>
      ) : notifications.map((n: any) => {
        const isUnread = !readIds.has(n.id);
        const Icon  = CATEGORY_ICON[n.category as NotifCategory];
        const color = CATEGORY_COLOR[n.category as NotifCategory];
        return (
          <div
            key={n.id}
            onClick={() => { markOneRead(n.id); if (n.linkTo) { onNavigate(n.linkTo); onClose(); } }}
            className={`px-4 py-3.5 cursor-pointer transition-all hover:bg-zinc-900/40 ${isUnread ? 'bg-zinc-900/20' : ''}`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
                <Icon className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className={`text-sm font-light truncate ${isUnread ? 'text-white' : 'text-zinc-400'}`}>{n.title}</p>
                  {n.important && <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" strokeWidth={1.5} />}
                </div>
                <p className="text-zinc-500 text-xs font-light line-clamp-2 leading-relaxed">{n.preview}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] font-light px-1.5 py-0.5 rounded-md"
                    style={{ color, background: `${color}10` }}>
                    {CATEGORY_LABEL[n.category as NotifCategory]}
                  </span>
                  <span className="text-zinc-700 text-[10px] font-light">
                    {formatDistanceToNow(n.createdAt, { addSuffix: true, locale: es })}
                  </span>
                </div>
              </div>
              {isUnread && <div className="w-1.5 h-1.5 rounded-full bg-white mt-2 flex-shrink-0" />}
            </div>
          </div>
        );
      })}
    </div>

    {/* Footer */}
    <div className="border-t border-zinc-800/60 px-4 py-3 flex items-center justify-between flex-shrink-0">
      <button
        onClick={() => { onClose(); onNavigate('/dashboard/settings'); }}
        className="text-zinc-600 hover:text-zinc-400 text-xs font-light transition-colors"
      >
        Configurar →
      </button>
      <span className="text-zinc-700 text-[10px] font-light">{notifications.length} total</span>
    </div>
  </div>,
  document.body
));
NotifPanel.displayName = 'NotifPanel';

// ── NavItem type ──────────────────────────────────────────────────────────────
interface NavItem {
  path: string;
  label: string;
  icon: React.FC<any>;
  show: boolean;
  badge?: number;
}

// ── SidebarNavLink ────────────────────────────────────────────────────────────
const SidebarNavLink: React.FC<{ item: NavItem; collapsed: boolean }> = memo(({ item, collapsed }) => (
  <NavLink
    to={item.path}
    end={item.path === '/dashboard'}
    className={({ isActive }) =>
      `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 relative group
       ${isActive
         ? 'nav-item-active text-theme-primary'
         : 'text-theme-muted hover:text-theme-primary hover:bg-white/[0.04]'
       }`
    }
  >
    <item.icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
    {!collapsed && (
      <span className="text-sm font-light whitespace-nowrap overflow-hidden flex-1 tracking-wide">
        {item.label}
      </span>
    )}
    {!collapsed && (item.badge ?? 0) > 0 && (
      <span className="bg-white text-black text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none">
        {(item.badge ?? 0) > 9 ? '9+' : item.badge}
      </span>
    )}
    {collapsed && (item.badge ?? 0) > 0 && (
      <span className="absolute left-6 top-1 w-3.5 h-3.5 bg-white rounded-full flex items-center justify-center">
        <span className="text-black text-[8px] font-medium leading-none">
          {(item.badge ?? 0) > 9 ? '9' : item.badge}
        </span>
      </span>
    )}
    {collapsed && (
      <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-zinc-900 border border-zinc-800 text-white text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 shadow-xl">
        {item.label}
      </div>
    )}
  </NavLink>
));
SidebarNavLink.displayName = 'SidebarNavLink';

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN LAYOUT
// ═══════════════════════════════════════════════════════════════════════════════
const DashboardLayout: React.FC = () => {
  const { currentUser, userProfile, isCEO, isContador, isProgramacion, loading } = useAuth();
  const role = userProfile?.role ?? '';
  const { settings, toggleSidebar } = useSettings();
  const navigate  = useNavigate();
  const location  = useLocation();
  const notifRef  = useRef<HTMLDivElement>(null);
  const isMobile  = useIsMobile();

  const [notifOpen,      setNotifOpen]      = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logoutPhase,    setLogoutPhase]    = useState<'idle'|'confirming'|'leaving'>('idle');
  const [cardAnimClass,  setCardAnimClass]  = useState('__lo_card_in');
  const [pageAnimClass,  setPageAnimClass]  = useState('');

  const sidebarCollapsed = settings.sidebarCollapsed;

  // ── Logout ────────────────────────────────────────────────────────────────
  const doLogout = useCallback(async () => {
    setPageAnimClass('__lo_page');
    await new Promise(r => setTimeout(r, 500));
    try { await logoutUser(); } catch (e) { console.error(e); }
    navigate('/');
  }, [navigate]);

  const { showModal: showTabModal, handleStayHere, handleGoToOther } = useTabSync(!!currentUser);
  const { showWarning, countdown, handleStayActive } = useAutoLogout(!!currentUser, doLogout);

  // ── Notificaciones ────────────────────────────────────────────────────────
  const { notifications, unreadCount, readIds, markOneRead, markAllRead, markPanelSeen } =
    useNotifications({
      uid:          currentUser?.uid,
      soundType:    settings.notificationSound  ?? 'default',
      soundVolume:  settings.notificationVolume ?? 0.7,
      muted:        settings.notificationsMuted ?? false,
      enabledCategories: {
        announcement: settings.notifyAnnouncements ?? true,
        email:        settings.notifyEmails        ?? true,
        thread:       settings.notifyThreads       ?? true,
        message:      settings.notifyMessages      ?? true,
      },
    });

  const unreadMails = notifications.filter(n => n.category === 'email' && !readIds.has(n.id)).length;
  const initials    = (userProfile?.displayName ?? 'U').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => { if (!loading && !currentUser) navigate('/'); }, [currentUser, loading, navigate]);

  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('click', unlock);
    document.addEventListener('keydown', unlock);
    return () => {
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && logoutPhase === 'confirming') handleCancelLogout();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [logoutPhase]);

  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);

  // ── Logout handlers ───────────────────────────────────────────────────────
  const handleLogoutClick = () => { setCardAnimClass('__lo_card_in'); setLogoutPhase('confirming'); };
  const handleCancelLogout = () => {
    setCardAnimClass('__lo_card_out');
    setTimeout(() => setLogoutPhase('idle'), 200);
  };
  const handleConfirmLogout = async () => {
    setCardAnimClass('__lo_card_out');
    await new Promise(r => setTimeout(r, 180));
    setCardAnimClass('__lo_card_in');
    setLogoutPhase('leaving');
    await new Promise(r => setTimeout(r, 1800));
    await doLogout();
  };

  const handleOpenPanel = () => setNotifOpen(p => { if (!p) markPanelSeen(); return !p; });

  // ── Nav items ─────────────────────────────────────────────────────────────
  const navItems = [
    { path: '/dashboard',               label: 'Dashboard',     icon: LayoutDashboard, show: true },
    { path: '/dashboard/calendar',      label: 'Calendario',    icon: Calendar,        show: true },
    { path: '/dashboard/discord',       label: 'Discord Bot',   icon: Bot,             show: true },
    { path: '/dashboard/announcements', label: 'Anuncios',      icon: Megaphone,       show: true },
    { path: '/dashboard/correo',        label: 'Correo',        icon: Mail,            show: true, badge: unreadMails },
    { path: '/dashboard/hilos',         label: 'Hilos',         icon: GitBranch,       show: true },
    { path: '/dashboard/mensajeria',    label: 'Mensajería',    icon: MessagesSquare,  show: true },
    { path: '/dashboard/webs',          label: 'Webs',          icon: Globe,           show: isCEO || role === 'Administración' },
    { path: '/dashboard/ceo-panel',     label: 'Panel CEO',     icon: Crown,           show: isCEO },
    { path: '/dashboard/admin',         label: 'Panel Admin',   icon: ShieldCheck,     show: role === 'Administración' },
    { path: '/dashboard/roles',         label: 'Gestión Roles', icon: UserCog,         show: role === 'Administración' },
    { path: '/dashboard/contador',      label: 'Contador',      icon: Calculator,      show: isContador },
    { path: '/dashboard/programacion',  label: 'Programación',  icon: Code2,           show: isProgramacion },
    { path: '/dashboard/diseno',        label: 'Diseño',        icon: Palette,         show: role === 'Diseño' },
    { path: '/dashboard/secretaria',    label: 'Secretaría',    icon: FileText,        show: role === 'Secretaría' },
    { path: '/dashboard/settings',      label: 'Configuración', icon: Settings,        show: true },
  ].filter(i => i.show);

  const bottomNavItems = [
    navItems.find(i => i.path === '/dashboard'),
    navItems.find(i => i.path === '/dashboard/correo'),
    navItems.find(i => i.path === '/dashboard/announcements'),
    navItems.find(i => i.path === '/dashboard/mensajeria'),
    navItems.find(i => i.path === '/dashboard/settings'),
  ].filter(Boolean) as typeof navItems;

  if (loading) return (
    <div className="h-full bg-theme-primary flex items-center justify-center">
      <div className="w-8 h-8 border border-zinc-700 border-t-zinc-200 rounded-full animate-spin" />
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <>
      <style>{GLOBAL_STYLES + SESSION_MODAL_STYLES}</style>

      {showTabModal && <TabSyncModal onStayHere={handleStayHere} onGoToOther={handleGoToOther} />}
      {showWarning  && <AutoLogoutModal countdown={countdown} totalSeconds={60} onStayActive={handleStayActive} />}

      {/* LogoutModal via portal — escapa el overflow:hidden del contenedor */}
      {logoutPhase !== 'idle' && (
        <LogoutModal
          phase={logoutPhase}
          onCancel={handleCancelLogout}
          onConfirm={handleConfirmLogout}
          cardClass={cardAnimClass}
          userName={userProfile?.displayName ?? 'Usuario'}
        />
      )}

      {/* ── MOBILE DRAWER ── */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent
          side="left"
          className="w-[280px] p-0 border-zinc-800/60"
          style={{ background: 'hsl(var(--secondary))', borderRight: '1px solid rgba(255,255,255,0.06)' }}
        >
          <SheetHeader className="px-5 py-5 border-b border-zinc-800/40">
            <SheetTitle className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center">
                <Moon className="w-4 h-4 text-white" strokeWidth={1} />
              </div>
              <span className="text-sm font-light tracking-[0.2em] text-white uppercase">Moon Studios</span>
            </SheetTitle>
          </SheetHeader>

          <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
            {navItems.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/dashboard'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all duration-150 relative
                   ${isActive ? 'nav-item-active text-white' : 'text-zinc-500 hover:text-white hover:bg-white/[0.04]'}`
                }
              >
                <item.icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
                <span className="text-sm font-light tracking-wide flex-1">{item.label}</span>
                {(item.badge ?? 0) > 0 && (
                  <span className="bg-white text-black text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none">
                    {(item.badge ?? 0) > 9 ? '9+' : item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-zinc-800/40 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl overflow-hidden bg-zinc-800 flex items-center justify-center flex-shrink-0">
                {userProfile?.avatar ? (
                  <img src={userProfile.avatar} alt={userProfile.displayName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white text-xs font-light">{initials}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-light truncate">{userProfile?.displayName || 'Usuario'}</p>
                <p className="text-zinc-500 text-xs font-light uppercase tracking-wider truncate">{userProfile?.role}</p>
              </div>
            </div>
            <button
              onClick={() => { setMobileMenuOpen(false); handleLogoutClick(); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-zinc-500 hover:text-white hover:bg-white/[0.04] transition-all duration-150"
            >
              <LogOut className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
              <span className="text-sm font-light">Cerrar Sesión</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── MAIN LAYOUT — h-full hereda del contenedor fixed de App.tsx ── */}
      <div className={`h-full bg-theme-primary flex overflow-hidden ${pageAnimClass}`}>

        {/* ── DESKTOP SIDEBAR ── */}
        {!isMobile && (
          <aside
            className={`bg-theme-secondary border-r border-theme/60 flex flex-col sidebar-transition flex-shrink-0 h-full ${sidebarCollapsed ? 'w-[60px]' : 'w-[220px]'}`}
            style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}
          >
            {/* Logo */}
            <div className="h-16 flex items-center px-4 border-b border-theme/40" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div className={`flex items-center gap-2.5 overflow-hidden ${sidebarCollapsed ? 'justify-center w-full' : ''}`}>
                <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/[0.07] flex items-center justify-center flex-shrink-0">
                  <Moon className="w-4 h-4 text-theme-primary" strokeWidth={1} />
                </div>
                {!sidebarCollapsed && (
                  <span className="text-sm font-light tracking-[0.18em] text-theme-primary uppercase whitespace-nowrap">
                    Moon
                  </span>
                )}
              </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
              {navItems.map(item => (
                <SidebarNavLink key={item.path} item={item} collapsed={sidebarCollapsed} />
              ))}
            </nav>

            {/* Bottom controls */}
            <div className="px-2 py-3 border-t border-theme/40 space-y-0.5" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <Button variant="ghost" size="sm" onClick={toggleSidebar}
                className="w-full justify-center text-theme-muted hover:text-theme-primary hover:bg-white/[0.04] rounded-xl">
                {sidebarCollapsed
                  ? <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
                  : <ChevronLeft  className="w-4 h-4" strokeWidth={1.5} />
                }
              </Button>
              <Button variant="ghost" onClick={handleLogoutClick}
                className="w-full flex items-center gap-2.5 text-theme-muted hover:text-theme-primary hover:bg-white/[0.04] justify-start rounded-xl px-3">
                <LogOut className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
                {!sidebarCollapsed && <span className="text-sm font-light">Cerrar Sesión</span>}
              </Button>
            </div>
          </aside>
        )}

        {/* ── CONTENT AREA ── */}
        <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">

          {/* ── HEADER ── */}
          <header
            className="h-14 md:h-16 flex items-center justify-between px-4 md:px-6 flex-shrink-0"
            style={{
              background: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            {/* Left */}
            <div className="flex items-center gap-3">
              {isMobile && (
                <button
                  onClick={() => setMobileMenuOpen(true)}
                  className="w-8 h-8 rounded-xl bg-white/[0.05] border border-white/[0.07] flex items-center justify-center text-zinc-400 hover:text-white transition-all"
                >
                  <Menu className="w-4 h-4" strokeWidth={1.5} />
                </button>
              )}
              <Clock isMobile={isMobile} />
            </div>

            {/* Right */}
            <div className="flex items-center gap-3 md:gap-5">
              {/* Bell */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={handleOpenPanel}
                  className="relative w-9 h-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] flex items-center justify-center text-zinc-400 hover:text-white transition-all"
                >
                  <Bell className="w-4 h-4" strokeWidth={1.5} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center">
                      <span className="text-black text-[9px] font-semibold leading-none">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    </span>
                  )}
                </button>
              </div>

              {notifOpen && createPortal(
                <div
                  className="fixed inset-0"
                  style={{ zIndex: 9989 }}
                  onClick={() => setNotifOpen(false)}
                />,
                document.body
              )}
              {notifOpen && (
                <NotifPanel
                  isMobile={isMobile}
                  notifications={notifications}
                  unreadCount={unreadCount}
                  readIds={readIds}
                  markOneRead={markOneRead}
                  markAllRead={markAllRead}
                  onClose={() => setNotifOpen(false)}
                  onNavigate={navigate}
                />
              )}

              {/* User */}
              <div className="flex items-center gap-2.5">
                {!isMobile && (
                  <div className="text-right">
                    <p className="text-theme-primary text-sm font-light">{userProfile?.displayName || 'Usuario'}</p>
                    <p className="text-zinc-500 text-[10px] font-light uppercase tracking-wider">{userProfile?.role}</p>
                  </div>
                )}
                <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 bg-zinc-800 border border-white/[0.07] flex items-center justify-center">
                  {userProfile?.avatar ? (
                    <>
                      <img
                        src={userProfile.avatar}
                        alt={userProfile.displayName}
                        className="w-full h-full object-cover"
                        onError={e => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                          const next = e.currentTarget.nextElementSibling as HTMLElement | null;
                          if (next) next.style.display = 'flex';
                        }}
                      />
                      <span className="text-white text-xs font-light hidden w-full h-full items-center justify-center">{initials}</span>
                    </>
                  ) : (
                    <span className="text-white text-xs font-light">{initials}</span>
                  )}
                </div>
              </div>
            </div>
          </header>

          {/* ── MAIN CONTENT ── */}
          <main className="flex-1 p-4 md:p-6 overflow-y-auto main-scroll pb-24 md:pb-6">
            <Outlet />
          </main>

          {/* ── MOBILE BOTTOM NAV ── */}
          {isMobile && (
            <nav
              className="bottom-nav-safe flex-shrink-0 flex items-center justify-around px-2 pt-2"
              style={{
                background: 'rgba(10,10,10,0.95)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                minHeight: '60px',
              }}
            >
              {bottomNavItems.map(item => {
                const isActive = item.path === '/dashboard'
                  ? location.pathname === '/dashboard'
                  : location.pathname.startsWith(item.path);
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/dashboard'}
                    className="relative flex flex-col items-center justify-center gap-1 min-w-[48px] py-1"
                  >
                    <div className={`w-10 h-8 rounded-xl flex items-center justify-center transition-all duration-200 relative
                      ${isActive ? 'bg-white/[0.1]' : 'hover:bg-white/[0.05]'}`}>
                      <item.icon
                        className={`w-4 h-4 transition-colors ${isActive ? 'text-white' : 'text-zinc-500'}`}
                        strokeWidth={1.5}
                      />
                      {(item.badge ?? 0) > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-white rounded-full flex items-center justify-center">
                          <span className="text-black text-[8px] font-semibold leading-none">
                            {(item.badge ?? 0) > 9 ? '9' : item.badge}
                          </span>
                        </span>
                      )}
                    </div>
                    <span className={`text-[9px] font-light tracking-wide transition-colors ${isActive ? 'text-white' : 'text-zinc-600'}`}>
                      {item.label}
                    </span>
                  </NavLink>
                );
              })}

              <button
                onClick={() => setMobileMenuOpen(true)}
                className="flex flex-col items-center justify-center gap-1 min-w-[48px] py-1"
              >
                <div className="w-10 h-8 rounded-xl flex items-center justify-center hover:bg-white/[0.05] transition-all">
                  <Menu className="w-4 h-4 text-zinc-500" strokeWidth={1.5} />
                </div>
                <span className="text-[9px] font-light tracking-wide text-zinc-600">Más</span>
              </button>
            </nav>
          )}
        </div>
      </div>
    </>
  );
};

export default DashboardLayout;