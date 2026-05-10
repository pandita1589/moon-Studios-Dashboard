import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { SettingsProvider } from '@/contexts/SettingsContext';
import Login from '@/components/Login';
import DashboardLayout from '@/components/DashboardLayout';
import DashboardHome from '@/components/DashboardHome';
import Calendar from '@/components/Calendar';
import DiscordBot from '@/components/DiscordBot';
import Announcements from '@/components/Announcements';
import Users from '@/components/Users';
import Settings from '@/components/Settings';
import CEOPanel from '@/components/CEOPanel';
import Correo from '@/components/Correo';
import Hilos, { HilosObserverView } from '@/components/Hilos';
import Mensajeria from '@/components/Mensajeria';
import Contador from '@/components/Contador';
import Webs from '@/Pages/Webs';
import PanelProgramacion from '@/components/PanelProgramacion';
import PanelAdmin      from '@/components/PanelAdmin';
import PanelDiseno     from '@/components/PanelDiseno';
import PanelRoles      from '@/components/PanelRoles';
import PanelSecretaria from '@/components/PanelSecretaria';
import TitleBar from '@/components/TitleBar';
import UpdateNotifier from '@/components/UpdateNotifier';

// Hook para detectar Tauri
const useIsTauri = () => {
  const [isTauri, setIsTauri] = React.useState(false);
  React.useEffect(() => {
    setIsTauri(typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window);
  }, []);
  return isTauri;
};

const HilosObserverWrapper: React.FC = () => {
  const { hiloId } = useParams<{ hiloId: string }>();
  return <HilosObserverView hiloId={hiloId || ''} />;
};

const PageLoader = () => (
  <div style={{ height: '100%', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <span style={{ color: '#fff', fontWeight: 200 }}>Cargando...</span>
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!currentUser) return <Navigate to="/" replace />;
  return <>{children}</>;
};

interface RoleRouteProps {
  children: React.ReactNode;
  allowedRoles: string[];
}
const RoleRoute: React.FC<RoleRouteProps> = ({ children, allowedRoles }) => {
  const { userProfile, loading } = useAuth();
  if (loading) return <PageLoader />;
  const role = userProfile?.role ?? '';
  if (!allowedRoles.includes(role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

function App() {
  const isTauri = useIsTauri();
  const titleBarHeight = isTauri ? 42 : 0;

  return (
    <AuthProvider>
      <SettingsProvider>
        <UpdateNotifier />
        {/* TitleBar solo aparece en Tauri */}
        <TitleBar />


        {/* Contenido: top dinámico según si hay TitleBar o no */}
        <div style={{
          position: 'fixed',
          top: `${titleBarHeight}px`,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
        }}>
          <Router>
            <Routes>
              <Route path="/" element={<Login />} />
              <Route path="/hilos/observe/:hiloId" element={<HilosObserverWrapper />} />
              <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                <Route index element={<DashboardHome />} />
                <Route path="calendar"      element={<Calendar />} />
                <Route path="discord"       element={<DiscordBot />} />
                <Route path="announcements" element={<Announcements />} />
                <Route path="correo"        element={<Correo />} />
                <Route path="hilos"         element={<Hilos />} />
                <Route path="mensajeria"    element={<Mensajeria />} />
                <Route path="settings"      element={<Settings />} />
                <Route path="webs"          element={<Webs />} />
                <Route path="users"         element={<RoleRoute allowedRoles={['Administración']}><Users /></RoleRoute>} />
                <Route path="ceo-panel"     element={<RoleRoute allowedRoles={['CEO']}><CEOPanel /></RoleRoute>} />
                <Route path="contador"      element={<RoleRoute allowedRoles={['Contador']}><Contador /></RoleRoute>} />
                <Route path="programacion"  element={<RoleRoute allowedRoles={['Programación']}><PanelProgramacion /></RoleRoute>} />
                <Route path="admin"         element={<RoleRoute allowedRoles={['Administración']}><PanelAdmin /></RoleRoute>} />
                <Route path="diseno"        element={<RoleRoute allowedRoles={['Diseño']}><PanelDiseno /></RoleRoute>} />
                <Route path="roles"         element={<RoleRoute allowedRoles={['Administración']}><PanelRoles /></RoleRoute>} />
                <Route path="secretaria"    element={<RoleRoute allowedRoles={['Secretaría']}><PanelSecretaria /></RoleRoute>} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Router>
        </div>
      </SettingsProvider>
    </AuthProvider>
  );
}

export default App;