import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getUserSettings, updateUserSettings } from '@/lib/firebase';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Settings {
  theme:            'dark' | 'light'| 'system';
  sidebarCollapsed: boolean;
  notifications:    boolean;
  language:         string;

  // Notificaciones
  notificationSound?:   'none' | 'soft' | 'default' | 'ping' | 'chime';
  notificationVolume?:  number;
  notificationsMuted?:  boolean;
  notifyAnnouncements?: boolean;
  notifyEmails?:        boolean;
  notifyThreads?:       boolean;
  notifyMessages?:      boolean;
  quietHoursEnabled?:   boolean;
  quietFrom?:           string;
  quietTo?:             string;
  desktopNotifs?:       boolean;
  emailDigest?:         'never' | 'daily' | 'weekly';
  badgeCount?:          boolean;

  // Apariencia
  accentColor?:     string;
  fontSize?:        'xs' | 'sm' | 'md' | 'lg' | 'xl';
  compactMode?:     boolean;
  animations?:      boolean;
  blurEffects?:     boolean;
  fontFamily?: string;

  // Privacidad
  profilePublic?:   boolean;
  showOnline?:      boolean;
  dataCollection?:  boolean;
  cookieAnalytics?: boolean;
  twoFAEnabled?:    boolean;
  loginAlerts?:     boolean;
  searchVisible?:   boolean;

  // Accesibilidad
  highContrast?:    boolean;
  reduceMotion?:    boolean;
  screenReader?:    boolean;
  focusIndicator?:  boolean;
  timezone?:        string;
  dateFormat?:      'dmy' | 'mdy' | 'ymd';

  // Almacenamiento
  autoBackup?:      boolean;
}

interface SettingsContextType {
  settings:           Settings;
  updateSettings:     (s: Partial<Settings>) => Promise<void>;
  toggleTheme:        () => void;
  toggleSidebar:      () => void;
  isDark:             boolean;
  isSidebarCollapsed: boolean;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const defaultSettings: Settings = {
  theme: 'dark' as const,
  fontFamily: 'DM Sans',
  sidebarCollapsed:    false,
  notifications:       true,
  language:            'es',
  notificationSound:   'default',
  notificationVolume:  0.7,
  notificationsMuted:  false,
  notifyAnnouncements: true,
  notifyEmails:        true,
  notifyThreads:       true,
  notifyMessages:      true,
  quietHoursEnabled:   false,
  quietFrom:           '22:00',
  quietTo:             '08:00',
  desktopNotifs:       true,
  emailDigest:         'daily',
  badgeCount:          true,
  accentColor:         '#6366f1',
  fontSize:            'md',
  compactMode:         false,
  animations:          true,
  blurEffects:         true,
  profilePublic:       true,
  showOnline:          true,
  dataCollection:      true,
  cookieAnalytics:     true,
  twoFAEnabled:        false,
  loginAlerts:         true,
  searchVisible:       true,
  highContrast:        false,
  reduceMotion:        false,
  screenReader:        false,
  focusIndicator:      true,
  timezone:            'America/Lima',
  dateFormat:          'dmy',
  autoBackup:          false,
};

// ─── Mapa de tamaños de fuente a rem ──────────────────────────────────────────

const FONT_SIZE_MAP: Record<string, string> = {
  xs: '12px',
  sm: '13px',
  md: '14px',
  lg: '16px',
  xl: '18px',
};

// ─── Aplicar todos los efectos de settings al DOM ────────────────────────────

function applySettingsToDom(s: Settings) {
  const root = document.documentElement;

  // ── Tema ──
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDarkMode  = s.theme === 'dark' || (s.theme === 'system' && prefersDark);

  root.classList.remove('dark', 'light');
  if (isDarkMode) {
    root.classList.add('dark');
    root.style.setProperty('--bg-main',    '#0a0a0a');
    root.style.setProperty('--bg-sidebar', '#080808');
    root.style.setProperty('--bg-header',  'rgba(0,0,0,0.45)');
    root.style.setProperty('--border-main',   'rgba(255,255,255,0.06)');
    root.style.setProperty('--border-header', 'rgba(255,255,255,0.05)');
    root.style.setProperty('--text-primary',  '#ffffff');
    root.style.setProperty('--text-muted',    'rgba(255,255,255,0.45)');
    root.style.setProperty('--sidebar-card-bg','rgba(255,255,255,0.03)');
    root.style.setProperty('--input-bg',      'rgba(255,255,255,0.04)');
    root.style.setProperty('--s-a02', 'rgba(255,255,255,0.02)');
    root.style.setProperty('--s-a03', 'rgba(255,255,255,0.03)');
    root.style.setProperty('--s-a04', 'rgba(255,255,255,0.04)');
    root.style.setProperty('--s-a05', 'rgba(255,255,255,0.05)');
    root.style.setProperty('--s-a06', 'rgba(255,255,255,0.06)');
    root.style.setProperty('--s-a07', 'rgba(255,255,255,0.07)');
    root.style.setProperty('--s-a08', 'rgba(255,255,255,0.08)');
    root.style.setProperty('--s-a10', 'rgba(255,255,255,0.1)');
    root.style.setProperty('--s-a12', 'rgba(255,255,255,0.12)');
    root.style.setProperty('--s-a18', 'rgba(255,255,255,0.18)');
    root.style.setProperty('--s-a20', 'rgba(255,255,255,0.2)');
    root.style.setProperty('--s-a25', 'rgba(255,255,255,0.25)');
    root.style.setProperty('--s-a30', 'rgba(255,255,255,0.3)');
    root.style.setProperty('--s-a35', 'rgba(255,255,255,0.35)');
    root.style.setProperty('--s-a40', 'rgba(255,255,255,0.4)');
    root.style.setProperty('--s-a45', 'rgba(255,255,255,0.45)');
    root.style.setProperty('--s-a50', 'rgba(255,255,255,0.5)');
    root.style.setProperty('--s-a55', 'rgba(255,255,255,0.55)');
    root.style.setProperty('--s-a60', 'rgba(255,255,255,0.6)');
    root.style.setProperty('--s-a70', 'rgba(255,255,255,0.7)');
    root.style.setProperty('--s-a75', 'rgba(255,255,255,0.75)');
    root.style.setProperty('--s-a80', 'rgba(255,255,255,0.8)');
    root.style.setProperty('--s-a85', 'rgba(255,255,255,0.85)');
    root.style.setProperty('--s-a90', 'rgba(255,255,255,0.9)');
    root.style.setProperty('--s-a95', 'rgba(255,255,255,0.95)');
  } else {
    root.classList.add('light');
    root.style.setProperty('--bg-main',    '#f4f4f5');
    root.style.setProperty('--bg-sidebar', '#ffffff');
    root.style.setProperty('--bg-header',  'rgba(255,255,255,0.85)');
    root.style.setProperty('--border-main',   'rgba(0,0,0,0.08)');
    root.style.setProperty('--border-header', 'rgba(0,0,0,0.07)');
    root.style.setProperty('--text-primary',  '#18181b');
    root.style.setProperty('--text-muted',    'rgba(0,0,0,0.50)');
    root.style.setProperty('--sidebar-card-bg','#ffffff');
    root.style.setProperty('--input-bg',      'rgba(0,0,0,0.03)');
    root.style.setProperty('--s-a02', 'rgba(0,0,0,0.02)');
    root.style.setProperty('--s-a03', 'rgba(0,0,0,0.03)');
    root.style.setProperty('--s-a04', 'rgba(0,0,0,0.04)');
    root.style.setProperty('--s-a05', 'rgba(0,0,0,0.05)');
    root.style.setProperty('--s-a06', 'rgba(0,0,0,0.06)');
    root.style.setProperty('--s-a07', 'rgba(0,0,0,0.07)');
    root.style.setProperty('--s-a08', 'rgba(0,0,0,0.08)');
    root.style.setProperty('--s-a10', 'rgba(0,0,0,0.1)');
    root.style.setProperty('--s-a12', 'rgba(0,0,0,0.12)');
    root.style.setProperty('--s-a18', 'rgba(0,0,0,0.18)');
    root.style.setProperty('--s-a20', 'rgba(0,0,0,0.2)');
    root.style.setProperty('--s-a25', 'rgba(0,0,0,0.25)');
    root.style.setProperty('--s-a30', 'rgba(0,0,0,0.3)');
    root.style.setProperty('--s-a35', 'rgba(0,0,0,0.35)');
    root.style.setProperty('--s-a40', 'rgba(0,0,0,0.4)');
    root.style.setProperty('--s-a45', 'rgba(0,0,0,0.45)');
    root.style.setProperty('--s-a50', 'rgba(0,0,0,0.5)');
    root.style.setProperty('--s-a55', 'rgba(0,0,0,0.55)');
    root.style.setProperty('--s-a60', 'rgba(0,0,0,0.6)');
    root.style.setProperty('--s-a70', 'rgba(0,0,0,0.7)');
    root.style.setProperty('--s-a75', 'rgba(0,0,0,0.75)');
    root.style.setProperty('--s-a80', 'rgba(0,0,0,0.8)');
    root.style.setProperty('--s-a85', 'rgba(0,0,0,0.85)');
    root.style.setProperty('--s-a90', 'rgba(0,0,0,0.9)');
    root.style.setProperty('--s-a95', 'rgba(0,0,0,0.95)');
  }

  // ── Color de acento ──
  root.style.setProperty('--accent',         s.accentColor ?? '#6366f1');
  root.style.setProperty('--accent-hover',   (s.accentColor ?? '#6366f1') + 'cc');
  root.style.setProperty('--settings-accent', s.accentColor ?? '#6366f1');

  // ── Tamaño de fuente ──
  root.style.fontSize = FONT_SIZE_MAP[s.fontSize ?? 'md'];

  // ── Modo compacto ──
  root.classList.toggle('compact', !!s.compactMode);

  // ── Animaciones ──
  if (s.animations === false) {
    root.style.setProperty('--transition-speed', '0ms');
    root.classList.add('no-animations');
  } else {
    root.style.setProperty('--transition-speed', '200ms');
    root.classList.remove('no-animations');
  }

  // ── Blur ──
  root.classList.toggle('no-blur', !s.blurEffects);

  // ── Alto contraste ──
  root.classList.toggle('high-contrast', !!s.highContrast);

  // ── Reducir movimiento ──
  if (s.reduceMotion) {
    root.style.setProperty('--motion', 'reduce');
    root.classList.add('reduce-motion');
  } else {
    root.style.removeProperty('--motion');
    root.classList.remove('reduce-motion');
  }

  // ── Lector de pantalla ──
  root.setAttribute('aria-live', s.screenReader ? 'polite' : 'off');

  // ── Indicador de foco ──
  if (s.focusIndicator) {
    root.classList.remove('no-focus-ring');
  } else {
    root.classList.add('no-focus-ring');
  }

  // ── Sidebar ──
  root.classList.toggle('sidebar-collapsed', !!s.sidebarCollapsed);

  // ── Fuente personalizada ──        ← AGREGAR ESTO
  if (s.fontFamily) {
    root.style.fontFamily = `'${s.fontFamily}', sans-serif`;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const SettingsContext = createContext<SettingsContextType>({
  settings:           defaultSettings,
  updateSettings:     async () => {},
  toggleTheme:        () => {},
  toggleSidebar:      () => {},
  isDark:             true,
  isSidebarCollapsed: false,
});

export const useSettings = () => useContext(SettingsContext);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loaded,   setLoaded]   = useState(false);

  // Carga inicial desde Firestore
  useEffect(() => {
    (async () => {
      if (currentUser) {
        try {
          const saved = await getUserSettings(currentUser.uid);
          const merged: Settings = { ...defaultSettings, ...saved };
          setSettings(merged);
          applySettingsToDom(merged);
        } catch (e) {
          console.error('Error loading settings:', e);
          applySettingsToDom(defaultSettings);
        }
      } else {
        applySettingsToDom(defaultSettings);
      }
      setLoaded(true);
    })();
  }, [currentUser]);

  // Aplica cambios al DOM cada vez que cambia settings
  useEffect(() => {
    if (loaded) applySettingsToDom(settings);
  }, [settings, loaded]);

  const updateSettings = async (newSettings: Partial<Settings>) => {
    const updated: Settings = { ...settings, ...newSettings };
    setSettings(updated);
    applySettingsToDom(updated);
    if (currentUser) {
      try {
        await updateUserSettings(currentUser.uid, updated);
      } catch (e) {
        console.error('Error saving settings:', e);
      }
    }
  };

  const toggleTheme = () => updateSettings({ theme: settings.theme === 'light' ? 'dark' : 'light' });
  const toggleSidebar = () => updateSettings({ sidebarCollapsed: !settings.sidebarCollapsed });

  if (!loaded) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <SettingsContext.Provider value={{
      settings,
      updateSettings,
      toggleTheme,
      toggleSidebar,
      isDark:             settings.theme === 'dark',
      isSidebarCollapsed: settings.sidebarCollapsed,
    }}>
      {children}
    </SettingsContext.Provider>
  );
};