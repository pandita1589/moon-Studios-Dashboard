import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getUserSettings, updateUserSettings } from '@/lib/firebase';

interface Settings {
  theme: 'dark' | 'light';
  sidebarCollapsed: boolean;
  notifications: boolean;
  language: string;
  // ── Notificaciones avanzadas ──
  notificationSound?:   'none' | 'soft' | 'default' | 'ping' | 'chime';
  notificationVolume?:  number;
  notificationsMuted?:  boolean;
  notifyAnnouncements?: boolean;
  notifyEmails?:        boolean;
  notifyThreads?:       boolean;
  notifyMessages?:      boolean;
}

interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  isDark: boolean;
  isSidebarCollapsed: boolean;
}

const defaultSettings: Settings = {
  theme:            'dark',
  sidebarCollapsed: false,
  notifications:    true,
  language:         'es',
  // ── Notificaciones avanzadas ──
  notificationSound:   'default',
  notificationVolume:  0.7,
  notificationsMuted:  false,
  notifyAnnouncements: true,
  notifyEmails:        true,
  notifyThreads:       true,
  notifyMessages:      true,
};

const SettingsContext = createContext<SettingsContextType>({
  settings: defaultSettings,
  updateSettings: async () => {},
  toggleTheme: () => {},
  toggleSidebar: () => {},
  isDark: true,
  isSidebarCollapsed: false
});

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      if (currentUser) {
        try {
          const userSettings = await getUserSettings(currentUser.uid);
          // El spread garantiza que los campos nuevos tengan sus defaults
          // si el usuario aún no los tiene guardados en Firestore
          setSettings(prev => ({ ...prev, ...userSettings }));
        } catch (error) {
          console.error('Error loading settings:', error);
        }
      }
      setLoaded(true);
    };
    loadSettings();
  }, [currentUser]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
    }
  }, [settings.theme]);

  const updateSettings = async (newSettings: Partial<Settings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    if (currentUser) {
      try {
        await updateUserSettings(currentUser.uid, updated);
      } catch (error) {
        console.error('Error saving settings:', error);
      }
    }
  };

  const toggleTheme = () => {
    updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' });
  };

  const toggleSidebar = () => {
    updateSettings({ sidebarCollapsed: !settings.sidebarCollapsed });
  };

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
      isDark: settings.theme === 'dark',
      isSidebarCollapsed: settings.sidebarCollapsed
    }}>
      {children}
    </SettingsContext.Provider>
  );
};