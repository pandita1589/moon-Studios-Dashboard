import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getBotStatus, getServers, startBot, sendBotMessage,
  getServerChannels, getBotCommands, updateBotProfile,
  getBotInvite, getAuditLog, getUptimeHistory, getPublicIncidents,
  createIncident, updateIncident, deleteIncident,
} from '@/services/discordApi';
import { getDiscordConfig, updateDiscordConfig, logActivity, db, Timestamp } from '@/lib/firebase';
import {
  collection, doc, getDoc, setDoc, addDoc,
  getDocs, orderBy, query, limit, deleteDoc,
} from 'firebase/firestore';
import {
  Bot, Server, XCircle, Play, RefreshCw, Send, MessageSquare,
  Hash, CheckCircle, Wifi, Clock, Users, Activity, Zap, Shield,
  AlertCircle, Settings, BarChart3, Terminal, Eye, EyeOff,
  Command, ChevronDown, ChevronRight, Key, Link, Wrench,
  AlertTriangle, CheckCircle2, TrendingUp,
  Trash2, Plus, Edit3, ExternalLink,
} from 'lucide-react';

/* ── Tipos ─────────────────────────────────────────────────────────────────── */
interface BotData {
  status: string; username?: string; discriminator?: string; id?: string;
  avatar?: string; ping?: number; uptime?: number;
  servers?: number; users?: number; serversList?: ServerInfo[];
  memoryUsage?: number; token?: string; botVersion?: string; prefix?: string;
}
interface ServerInfo {
  id: string; name: string; icon?: string; banner?: string;
  memberCount?: number; boostLevel?: number; boostCount?: number; description?: string;
}
interface ChannelInfo { id: string; name: string; type?: number; parent?: string | null; }
interface CommandOption { name: string; description: string; type: string; required: boolean; choices: { name: string; value: string }[]; }
interface BotCommand { id: string; name: string; description: string; type: string; scope: 'global' | 'guild'; options: CommandOption[]; nsfw: boolean; }
interface CommandsData { total: number; global: number; guild: number; commands: BotCommand[]; }
interface UptimeDay { date: string; status: string; uptimePct: number | null; snapshots: number; avgPing?: number; }
interface Incident {
  id: string; title: string; status: string; impact: string;
  createdAt: string; resolvedAt: string | null;
  updates: { id: string; status: string; body: string; createdAt: string }[];
}
interface MaintenanceState {
  active: boolean;
  description?: string;
  reason?: string;
  startDate?: any;
  endDate?: any;
  authorId?: string;
  authorTag?: string;
}
interface MaintenanceHistoryEntry {
  id: string;
  description?: string;
  reason?: string;
  startDate?: any;
  endDate?: any;
  duration?: number;
  authorTag?: string;
  deactivatedByTag?: string;
}
interface MaintenanceStats {
  total: number;
  averageDuration: number;
  longestDuration: number;
  shortestDuration: number;
  lastMaintenance?: Date | null;
}
interface AuditEntry { id: string; action: number; executor: string | null; executorId: string | null; targetId: string | null; reason: string | null; createdAt: string; }

interface BugReport {
  reportId: string;
  usuarioId: string;
  usuarioTag: string;
  servidorNombre?: string | null;
  titulo: string;
  descripcion: string;
  pasos?: string | null;
  esperadoVsActual?: string | null;
  severidad: 'critico' | 'alto' | 'medio' | 'bajo';
  estado: 'abierto' | 'revisando' | 'en_proceso' | 'resuelto' | 'invalido';
  imagenes?: string[];
  createdAt: any;
  updatedAt?: any;
  revisadoPor?: string | null;
  resueltoPor?: string | null;
}

/* ── Design tokens ─────────────────────────────────────────────────────────── */
const bd = 'hsl(var(--border))';
const sf = 'hsl(var(--card))';
const sc = 'hsl(var(--secondary))';
const mt = 'hsl(var(--muted-foreground))';

/* ── Helpers ────────────────────────────────────────────────────────────────── */
const formatUptime  = (ms?: number) => { if (!ms || ms <= 0) return '—'; const s = Math.floor(ms / 1000); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`; if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`; return `${m}m`; };
const getPingColor  = (p?: number) => !p ? mt : p < 80 ? '#4ade80' : p < 200 ? '#facc15' : '#f87171';
const maskToken     = (t?: string) => !t ? 'No disponible' : t.substring(0, 10) + '••••••' + t.slice(-5);

const REASON_MAP: Record<string, string> = {
  updates:     '🔄 Actualizaciones del sistema',
  bugfixes:    '🐛 Corrección de errores',
  features:    '🚀 Nuevas características',
  scheduled:   '🔧 Mantenimiento programado',
  emergency:   '🚨 Mantenimiento de emergencia',
  performance: '📊 Optimización de rendimiento',
  security:    '🔒 Actualizaciones de seguridad',
  other:       '📝 Otro',
};

const formatDuration = (ms?: number) => {
  if (!ms || ms <= 0) return '—';
  if (ms < 60_000)     return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000)  return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) { const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000); return m > 0 ? `${h}h ${m}m` : `${h}h`; }
  const d = Math.floor(ms / 86_400_000), h = Math.floor((ms % 86_400_000) / 3_600_000);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
};

const toDate = (value: any): Date | null => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value < 1e10 ? value * 1000 : value);
  if (typeof value === 'string') { const d = new Date(value); return isNaN(d.getTime()) ? null : d; }
  return null;
};

const UPTIME_STATUS_COLOR: Record<string, string> = {
  operacional:   '#4ade80',
  degradado:     '#facc15',
  caida_parcial: '#fb923c',
  caida_mayor:   '#f87171',
  desconocido:   '#3f3f46',
};

const INCIDENT_STATUS: Record<string, { label: string; color: string }> = {
  investigando:  { label: 'Investigando',  color: '#f87171' },
  identificado:  { label: 'Identificado',  color: '#fb923c' },
  monitoreando:  { label: 'Monitoreando', color: '#facc15' },
  resuelto:      { label: 'Resuelto',      color: '#4ade80' },
};

const IMPACT_CONFIG: Record<string, { label: string; color: string }> = {
  ninguno:  { label: 'Ninguno',  color: '#6b7280' },
  menor:    { label: 'Menor',    color: '#facc15' },
  mayor:    { label: 'Mayor',    color: '#fb923c' },
  crítico:  { label: 'Crítico',  color: '#f87171' },
};

const BUG_SEVERIDAD: Record<string, { label: string; color: string }> = {
  critico: { label: 'Crítico', color: '#f87171' },
  alto:    { label: 'Alto',    color: '#fb923c' },
  medio:   { label: 'Medio',   color: '#facc15' },
  bajo:    { label: 'Bajo',    color: '#4ade80' },
};

const BUG_ESTADO: Record<string, { label: string; color: string }> = {
  abierto:    { label: 'Abierto',    color: '#facc15' },
  revisando:  { label: 'Revisando',  color: '#818cf8' },
  en_proceso: { label: 'En proceso', color: '#c084fc' },
  resuelto:   { label: 'Resuelto',   color: '#4ade80' },
  invalido:   { label: 'Inválido',   color: '#6b7280' },
};

// Transiciones válidas (igual que el bot)
const BUG_TRANSITIONS: Record<string, string[]> = {
  abierto:    ['revisando', 'invalido'],
  revisando:  ['en_proceso', 'resuelto', 'invalido'],
  en_proceso: ['resuelto', 'invalido'],
  resuelto:   ['abierto'],
  invalido:   ['abierto'],
};

/* ── Sub-components ─────────────────────────────────────────────────────────── */
const Skel: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-zinc-900 rounded-xl ${className}`} />
);

const StatusPill: React.FC<{ online: boolean }> = ({ online }) => (
  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-light"
    style={{
      background: online ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
      border: `1px solid ${online ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`,
      color: online ? '#4ade80' : '#f87171',
    }}>
    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
      style={{ background: online ? '#4ade80' : '#f87171', animation: online ? 'pulse 2s infinite' : 'none' }} />
    {online ? 'Online' : 'Offline'}
  </span>
);

const MiniStat: React.FC<{ label: string; value: React.ReactNode; icon: React.ReactNode; accent?: string }> = ({ label, value, icon, accent }) => (
  <div className="p-4 rounded-2xl border" style={{ background: sf, borderColor: bd }}>
    <div className="flex items-start justify-between">
      <div>
        <p className="text-[10px] uppercase tracking-widest font-light mb-2" style={{ color: mt }}>{label}</p>
        <p className="text-2xl font-light" style={{ color: accent ?? 'white' }}>{value}</p>
      </div>
      <div style={{ color: 'rgba(255,255,255,0.12)' }}>{icon}</div>
    </div>
  </div>
);

const CommandCard: React.FC<{ cmd: BotCommand }> = ({ cmd }) => {
  const [open, setOpen] = useState(false);
  const typeColor: Record<string, string> = { SLASH: '#818cf8', USER: '#38bdf8', MESSAGE: '#fbbf24' };
  const tc = typeColor[cmd.type] ?? '#818cf8';
  return (
    <div className="rounded-2xl overflow-hidden border transition-colors" style={{ borderColor: bd, background: sf }}>
      <button onClick={() => cmd.options.length > 0 && setOpen(!open)}
        className={`w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.03] transition-colors ${cmd.options.length === 0 ? 'cursor-default' : ''}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${tc}15`, border: `1px solid ${tc}25` }}>
            <span className="text-sm font-light" style={{ color: tc }}>/</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="text-white font-light text-sm">{cmd.name}</span>
              <span className="text-[10px] font-light px-1.5 py-0.5 rounded-full" style={{ background: `${tc}15`, color: tc }}>{cmd.type}</span>
              {cmd.scope === 'guild' && <span className="text-[10px] font-light px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(192,132,252,0.1)', color: '#c084fc' }}>guild</span>}
              {cmd.nsfw && <span className="text-[10px] font-light px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400">NSFW</span>}
            </div>
            <p className="text-xs font-light truncate" style={{ color: mt }}>{cmd.description}</p>
          </div>
        </div>
        {cmd.options.length > 0 && (
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
            <span className="text-[10px] font-light" style={{ color: mt }}>{cmd.options.length} opts</span>
            {open ? <ChevronDown className="w-3.5 h-3.5" style={{ color: mt }} /> : <ChevronRight className="w-3.5 h-3.5" style={{ color: mt }} />}
          </div>
        )}
      </button>
      {open && cmd.options.length > 0 && (
        <div className="border-t divide-y" style={{ borderColor: bd }}>
          {cmd.options.map(opt => (
            <div key={opt.name} className="flex items-start gap-3 px-4 py-3">
              <Hash className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: mt }} />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-light font-mono" style={{ color: 'rgba(255,255,255,0.8)' }}>{opt.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md font-light" style={{ background: 'rgba(255,255,255,0.06)', color: mt }}>{opt.type}</span>
                  {opt.required && <span className="text-[10px] px-1.5 py-0.5 rounded-md font-light bg-red-500/10 text-red-400">req</span>}
                </div>
                <p className="text-xs font-light mt-0.5" style={{ color: mt }}>{opt.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ── Main ──────────────────────────────────────────────────────────────────── */
const DiscordBot: React.FC = () => {
  const { isCEO, userProfile } = useAuth();

  // Core
  const [botData,        setBotData]        = useState<BotData | null>(null);
  const [config,         setConfig]         = useState<any>({});
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [token,          setToken]          = useState('');
  const [starting,       setStarting]       = useState(false);
  const [activeTab,      setActiveTab]      = useState('status');
  const [showToken,      setShowToken]      = useState(false);
  const [savingName,     setSavingName]     = useState(false);
  const [activityLog,    setActivityLog]    = useState<{ time: string; text: string; type: 'info' | 'success' | 'error' }[]>([]);

  // Mensajes
  const [selectedServer,  setSelectedServer]  = useState('');
  const [channels,        setChannels]        = useState<ChannelInfo[]>([]);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [messageText,     setMessageText]     = useState('');
  const [sending,         setSending]         = useState(false);
  const [sendResult,      setSendResult]      = useState<any>(null);
  const [loadingChannels, setLoadingChannels] = useState(false);

  // Comandos
  const [commandsData,    setCommandsData]    = useState<CommandsData | null>(null);
  const [loadingCommands, setLoadingCommands] = useState(false);
  const [commandSearch,   setCommandSearch]   = useState('');
  const [commandFilter,   setCommandFilter]   = useState<'all' | 'global' | 'guild'>('all');

  // Uptime
  const [uptimeData,      setUptimeData]      = useState<UptimeDay[]>([]);
  const [loadingUptime,   setLoadingUptime]   = useState(false);

  // Incidentes
  const [incidents,       setIncidents]       = useState<Incident[]>([]);
  const [loadingIncidents,setLoadingIncidents]= useState(false);
  const [showIncidentForm,setShowIncidentForm]= useState(false);
  const [incidentForm,    setIncidentForm]    = useState({ title: '', impact: 'menor', message: '' });
  const [savingIncident,  setSavingIncident]  = useState(false);
  const [selectedIncident,setSelectedIncident]= useState<Incident | null>(null);
  const [updateForm,      setUpdateForm]      = useState({ status: 'monitoreando', message: '' });
  const [incidentView,    setIncidentView]    = useState<'sistema' | 'bugs'>('sistema');

  // Bug Reports
  const [bugReports,      setBugReports]      = useState<BugReport[]>([]);
  const [loadingBugs,     setLoadingBugs]     = useState(false);
  const [selectedBug,     setSelectedBug]     = useState<BugReport | null>(null);
  const [bugImageIndex,   setBugImageIndex]   = useState(0);
  const [bugFilter,       setBugFilter]       = useState<string>('all');
  const [savingBugStatus, setSavingBugStatus] = useState(false);

  // Mantenimiento
  const [maintenance,       setMaintenance]       = useState<MaintenanceState | null>(null);
  const [maintForm,         setMaintForm]          = useState({ reasonKey: 'scheduled', description: '', durationStr: '' });
  const [togglingMaint,     setTogglingMaint]      = useState(false);
  const [maintHistory,      setMaintHistory]       = useState<MaintenanceHistoryEntry[]>([]);
  const [maintStats,        setMaintStats]         = useState<MaintenanceStats | null>(null);
  const [loadingMaintHist,  setLoadingMaintHist]   = useState(false);
  const [maintView,         setMaintView]          = useState<'control' | 'history' | 'stats'>('control');

  // Audit log
  const [auditEntries,    setAuditEntries]    = useState<AuditEntry[]>([]);
  const [auditGuildId,    setAuditGuildId]    = useState('');
  const [loadingAudit,    setLoadingAudit]    = useState(false);

  // Invite
  const [inviteUrl,       setInviteUrl]       = useState('');

  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);

  const pushLog = (text: string, type: 'info' | 'success' | 'error' = 'info') => {
    const now = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setActivityLog(prev => [{ time: now, text, type }, ...prev].slice(0, 100));
  };

  // ── Fetch principal ──────────────────────────────────────────────────────
  const fetchAllData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true); else setRefreshing(true);
      const [status, servers, discordConfig] = await Promise.all([
        getBotStatus().catch(() => ({ status: 'offline', servers: 0, users: 0 })),
        getServers().catch(() => []),
        getDiscordConfig().catch(() => ({})),
      ]);
      setBotData({ ...status, serversList: servers });
      setConfig(discordConfig || {});
      if (silent) pushLog('Datos actualizados automáticamente', 'info');
    } catch (err: any) {
      setError(err.message);
      pushLog(`Error al actualizar: ${err.message}`, 'error');
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  const fetchCommands = useCallback(async (guildId?: string) => {
    setLoadingCommands(true);
    try {
      const data: CommandsData = await getBotCommands(guildId);
      setCommandsData(data);
      pushLog(`${data.total} comandos cargados`, 'success');
    } catch (err: any) { pushLog(`Error comandos: ${err.message}`, 'error'); }
    finally { setLoadingCommands(false); }
  }, []);

  const fetchUptime = useCallback(async () => {
    setLoadingUptime(true);
    try {
      const data = await getUptimeHistory();
      setUptimeData(data);
    } catch (err: any) { pushLog(`Error uptime: ${err.message}`, 'error'); }
    finally { setLoadingUptime(false); }
  }, []);

  const fetchIncidents = useCallback(async () => {
    setLoadingIncidents(true);
    try {
      const data = await getPublicIncidents();
      setIncidents(Array.isArray(data) ? data : []);
    } catch (err: any) { pushLog(`Error incidentes: ${err.message}`, 'error'); }
    finally { setLoadingIncidents(false); }
  }, []);

  const fetchBugReports = useCallback(async () => {
    setLoadingBugs(true);
    try {
      const q = query(
        collection(db, 'bug_reports'),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      const snap = await getDocs(q);
      setBugReports(snap.docs.map(d => ({ ...d.data() } as BugReport)));
    } catch (err: any) {
      pushLog(`Error reportes: ${err.message}`, 'error');
    } finally {
      setLoadingBugs(false);
    }
  }, []);

  const handleBugStatusChange = async (report: BugReport, nuevoEstado: string) => {
    setSavingBugStatus(true);
    try {
      await setDoc(
        doc(db, 'bug_reports', report.reportId),
        { estado: nuevoEstado, updatedAt: Timestamp.now() },
        { merge: true }
      );
      setBugReports(prev => prev.map(r =>
        r.reportId === report.reportId ? { ...r, estado: nuevoEstado as any } : r
      ));
      if (selectedBug?.reportId === report.reportId) {
        setSelectedBug(prev => prev ? { ...prev, estado: nuevoEstado as any } : null);
      }
      pushLog(`Reporte ${report.reportId} → ${nuevoEstado}`, 'success');
    } catch (err: any) {
      pushLog(`Error cambiando estado: ${err.message}`, 'error');
    } finally {
      setSavingBugStatus(false);
    }
  };

  const handleDeleteBugReport = async (reportId: string) => {
    if (!confirm(`¿Eliminar el reporte ${reportId}?`)) return;
    try {
      const dd = deleteDoc;
      await dd(doc(db, 'bug_reports', reportId));
      setBugReports(prev => prev.filter(r => r.reportId !== reportId));
      if (selectedBug?.reportId === reportId) setSelectedBug(null);
      pushLog(`Reporte ${reportId} eliminado`, 'success');
    } catch (err: any) {
      pushLog(`Error eliminando: ${err.message}`, 'error');
    }
  };

  const fetchMaintenance = useCallback(async () => {
    try {
      const snap = await getDoc(doc(db, 'maintenance', 'current'));
      if (snap.exists()) {
        setMaintenance(snap.data() as MaintenanceState);
      } else {
        setMaintenance({ active: false });
      }
    } catch (err: any) {
      console.error('fetchMaintenance:', err);
      setMaintenance({ active: false });
    }
  }, []);

  const fetchMaintHistory = useCallback(async () => {
    setLoadingMaintHist(true);
    try {
      const q = query(
        collection(db, 'maintenance', 'history', 'records'),
        orderBy('startDate', 'desc'),
        limit(10)
      );
      const snap = await getDocs(q);
      setMaintHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as MaintenanceHistoryEntry)));
    } catch (err: any) {
      pushLog(`Error historial: ${err.message}`, 'error');
    } finally {
      setLoadingMaintHist(false);
    }
  }, []);

  const fetchMaintStats = useCallback(async () => {
    try {
      const q = query(collection(db, 'maintenance', 'history', 'records'), orderBy('startDate', 'desc'), limit(50));
      const snap = await getDocs(q);
      const records = snap.docs.map(d => d.data());
      if (records.length === 0) {
        setMaintStats({ total: 0, averageDuration: 0, longestDuration: 0, shortestDuration: 0 });
        return;
      }
      const durations = records.map((r: any) => r.duration).filter((d: any) => d > 0);
      setMaintStats({
        total: records.length,
        averageDuration: durations.length ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length : 0,
        longestDuration:  durations.length ? Math.max(...durations) : 0,
        shortestDuration: durations.length ? Math.min(...durations) : 0,
        lastMaintenance:  toDate((records[0] as any)?.startDate),
      });
    } catch (err: any) {
      pushLog(`Error stats: ${err.message}`, 'error');
    }
  }, []);

  // ── Auto-refresh cada 30s ────────────────────────────────────────────────
  useEffect(() => {
    fetchAllData();
    fetchMaintenance();
    autoRefreshRef.current = setInterval(() => { fetchAllData(true); fetchMaintenance(); }, 30_000);
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [fetchAllData, fetchMaintenance]);

  useEffect(() => {
    if (activeTab === 'commands'  && !commandsData)       fetchCommands();
    if (activeTab === 'uptime'    && !uptimeData.length)  fetchUptime();
    if (activeTab === 'incidents')                        { fetchIncidents(); fetchBugReports(); }
    if (activeTab === 'maintenance' && maintView === 'history') fetchMaintHistory();
    if (activeTab === 'maintenance' && maintView === 'stats')   { setMaintStats(null); fetchMaintStats(); }
  }, [activeTab, maintView]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAllData(true);
    if (activeTab === 'commands') await fetchCommands();
    if (activeTab === 'uptime')   await fetchUptime();
    if (activeTab === 'incidents') await fetchIncidents();
    setRefreshing(false);
  };

  // ── Mensajes ─────────────────────────────────────────────────────────────
  const loadChannels = async (guildId: string) => {
    if (!guildId) return;
    setLoadingChannels(true);
    try { setChannels(await getServerChannels(guildId)); setSelectedChannel(''); }
    catch { setChannels([]); }
    finally { setLoadingChannels(false); }
  };

  const handleServerSelect = (guildId: string) => {
    setSelectedServer(guildId); loadChannels(guildId); setSendResult(null); setError(null);
  };

  const handleSendMessage = async () => {
    if (!selectedServer || !selectedChannel || !messageText.trim()) { setError('Completa todos los campos'); return; }
    setSending(true); setError(null);
    try {
      await sendBotMessage(selectedServer, selectedChannel, messageText);
      setSendResult(true); setMessageText('');
      pushLog(`Mensaje enviado a #${channels.find(c => c.id === selectedChannel)?.name}`, 'success');
      await logActivity('MESSAGE_SENT', { guildId: selectedServer, channelId: selectedChannel }, userProfile?.uid || '', userProfile?.displayName || '');
    } catch (err: any) { setError(err.message); pushLog(`Error: ${err.message}`, 'error'); }
    finally { setSending(false); }
  };

  const handleStartBot = async () => {
    if (!token.trim()) return;
    setStarting(true); setError(null);
    try {
      await startBot(token);
      pushLog('Bot iniciado correctamente', 'success');
      await logActivity('BOT_STARTED', {}, userProfile?.uid || '', userProfile?.displayName || '');
      setToken(''); await fetchAllData();
    } catch (err: any) { setError('Error: ' + err.message); pushLog(`Error inicio: ${err.message}`, 'error'); }
    finally { setStarting(false); }
  };

  const handleUpdateBotName = async () => {
    if (!config.botName || config.botName === botData?.username) return;
    setSavingName(true); setError(null);
    try {
      await updateBotProfile(config.botName);
      await updateDiscordConfig({ ...config, botName: config.botName });
      pushLog(`Nombre actualizado: ${config.botName}`, 'success');
      await fetchAllData(true);
    } catch (err: any) { setError(err.message); pushLog(`Error: ${err.message}`, 'error'); }
    finally { setSavingName(false); }
  };

  // ── Mantenimiento ─────────────────────────────────────────────────────────
  const handleActivateMaintenance = async () => {
    if (!maintForm.description.trim()) return;
    setTogglingMaint(true);
    try {
      const reasonText = REASON_MAP[maintForm.reasonKey] ?? REASON_MAP.other;
      let endDate: Date | null = null;
      if (maintForm.durationStr.trim()) {
        const ms = parseDuration(maintForm.durationStr.trim());
        if (ms > 0) endDate = new Date(Date.now() + ms);
      }
      const data: any = {
        active:      true,
        reason:      reasonText,
        description: maintForm.description.trim(),
        startDate:   Timestamp.now(),
        authorId:    userProfile?.uid            ?? '',
        authorTag:   userProfile?.displayName    ?? 'CEO Dashboard',
      };
      if (endDate) data.endDate = Timestamp.fromDate(endDate);

      // Usar setDoc sin merge para sobreescribir limpiamente
      await setDoc(doc(db, 'maintenance', 'current'), data);

      setMaintenance(data);
      setMaintForm({ reasonKey: 'scheduled', description: '', durationStr: '' });
      pushLog(`Mantenimiento activado: ${reasonText}`, 'error');
      await logActivity('MAINTENANCE_ACTIVATED', { reason: reasonText }, userProfile?.uid || '', userProfile?.displayName || '');
    } catch (err: any) {
      pushLog(`Error activando: ${err.message}`, 'error');
      console.error('handleActivateMaintenance:', err);
    } finally {
      setTogglingMaint(false);
    }
  };

  const handleDeactivateMaintenance = async () => {
    setTogglingMaint(true);
    try {
      const currentRef  = doc(db, 'maintenance', 'current');
      const currentSnap = await getDoc(currentRef);
      const current     = currentSnap.exists() ? currentSnap.data() : null;

      // 1. Desactivar primero — siempre usando setDoc + merge para no fallar si faltan campos
      await setDoc(currentRef, {
        active:           false,
        endDate:          Timestamp.now(),
        deactivatedBy:    userProfile?.uid         ?? '',
        deactivatedByTag: userProfile?.displayName ?? 'CEO Dashboard',
      }, { merge: true });

      // 2. Guardar en historial de forma no-bloqueante (si falla no interrumpe)
      if (current?.active) {
        const startMs  = toDate(current.startDate)?.getTime() ?? Date.now();
        const duration = Date.now() - startMs;
        try {
          // Asegurar que el doc padre maintenance/history exista
          await setDoc(doc(db, 'maintenance', 'history'), { created: true }, { merge: true });
          await addDoc(collection(db, 'maintenance', 'history', 'records'), {
            ...current,
            endDate:          Timestamp.now(),
            duration,
            deactivatedBy:    userProfile?.uid         ?? '',
            deactivatedByTag: userProfile?.displayName ?? 'CEO Dashboard',
          });
        } catch (histErr: any) {
          // El historial no es crítico — loguear pero no interrumpir
          console.warn('Historial mantenimiento:', histErr.message);
          pushLog('Desactivado (sin historial: permisos)', 'info');
        }
      }

      setMaintenance(prev => prev ? { ...prev, active: false } : { active: false });
      pushLog('Mantenimiento desactivado', 'success');
      await logActivity('MAINTENANCE_DEACTIVATED', {}, userProfile?.uid || '', userProfile?.displayName || '');
    } catch (err: any) {
      pushLog(`Error desactivando: ${err.message}`, 'error');
      console.error('handleDeactivateMaintenance:', err);
    } finally {
      setTogglingMaint(false);
    }
  };

  const parseDuration = (str: string): number => {
    if (!str || !/^(\d+[mhd])+$/.test(str)) return 0;
    let total = 0;
    const regex = /(\d+)([mhd])/g; let match;
    while ((match = regex.exec(str)) !== null) {
      const v = parseInt(match[1]);
      if (v <= 0) continue;
      if (match[2] === 'm') total += v * 60_000;
      if (match[2] === 'h') total += v * 3_600_000;
      if (match[2] === 'd') total += v * 86_400_000;
    }
    return total;
  };

  // ── Incidentes ────────────────────────────────────────────────────────────
  const handleCreateIncident = async () => {
    if (!incidentForm.title.trim()) return;
    setSavingIncident(true);
    try {
      await createIncident(incidentForm.title, incidentForm.impact, incidentForm.message);
      setShowIncidentForm(false);
      setIncidentForm({ title: '', impact: 'menor', message: '' });
      pushLog(`Incidente creado: ${incidentForm.title}`, 'error');
      await fetchIncidents();
    } catch (err: any) { pushLog(`Error: ${err.message}`, 'error'); }
    finally { setSavingIncident(false); }
  };

  const handleUpdateIncident = async () => {
    if (!selectedIncident || !updateForm.message.trim()) return;
    setSavingIncident(true);
    try {
      await updateIncident(selectedIncident.id, updateForm.status, updateForm.message);
      setSelectedIncident(null);
      pushLog(`Incidente actualizado → ${updateForm.status}`, 'success');
      await fetchIncidents();
    } catch (err: any) { pushLog(`Error: ${err.message}`, 'error'); }
    finally { setSavingIncident(false); }
  };

  const handleDeleteIncident = async (id: string) => {
    if (!confirm('¿Eliminar este incidente?')) return;
    try {
      await deleteIncident(id);
      pushLog('Incidente eliminado', 'success');
      await fetchIncidents();
    } catch (err: any) { pushLog(`Error: ${err.message}`, 'error'); }
  };

  // ── Audit log ─────────────────────────────────────────────────────────────
  const handleFetchAudit = async () => {
    if (!auditGuildId) return;
    setLoadingAudit(true);
    try {
      const data = await getAuditLog(auditGuildId, 30);
      setAuditEntries(Array.isArray(data) ? data : []);
      pushLog(`${data.length ?? 0} entradas de audit`, 'success');
    } catch (err: any) { pushLog(`Error audit: ${err.message}`, 'error'); }
    finally { setLoadingAudit(false); }
  };

  // ── Invite ────────────────────────────────────────────────────────────────
  const handleGetInvite = async () => {
    try {
      const data = await getBotInvite();
      setInviteUrl(data.url);
      pushLog('Link de invitación generado', 'success');
    } catch (err: any) { pushLog(`Error invite: ${err.message}`, 'error'); }
  };

  const filteredCommands = (commandsData?.commands || []).filter(cmd => {
    const ms = cmd.name.toLowerCase().includes(commandSearch.toLowerCase()) || cmd.description.toLowerCase().includes(commandSearch.toLowerCase());
    const mf = commandFilter === 'all' || cmd.scope === commandFilter;
    return ms && mf;
  });

  const TABS = [
    { value: 'status',      label: 'Estado',      icon: Activity },
    { value: 'servers',     label: 'Servidores',  icon: Server },
    { value: 'uptime',      label: 'Uptime',      icon: TrendingUp },
    { value: 'incidents',   label: 'Incidentes',  icon: AlertTriangle, badge: incidents.filter(i => i.status !== 'resuelto').length + bugReports.filter(b => b.estado === 'abierto').length },
    { value: 'commands',    label: 'Comandos',    icon: Command, badge: commandsData?.total },
    ...(isCEO ? [
      { value: 'messages',    label: 'Mensajes',    icon: MessageSquare },
      { value: 'maintenance', label: 'Mantenimiento', icon: Wrench },
      { value: 'audit',       label: 'Audit Log',   icon: Shield },
      { value: 'logs',        label: 'Actividad',   icon: Terminal },
      { value: 'config',      label: 'Config',      icon: Settings },
    ] : []),
  ];

  const selectCls = "w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none appearance-none";
  const selectSt: React.CSSProperties = { background: sc, border: `1px solid ${bd}`, color: 'white' };

  // ── Loading / Offline screens ────────────────────────────────────────────
  if (loading) return (
    <div className="space-y-5">
      <Skel className="h-8 w-48" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[...Array(4)].map((_, i) => <Skel key={i} className="h-24" />)}</div>
      <Skel className="h-10" /><Skel className="h-48" />
    </div>
  );

  if (!botData?.status || botData.status === 'offline') return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}>
          <Bot className="w-4 h-4" style={{ color: '#60a5fa' }} strokeWidth={1.5} />
        </div>
        <h1 className="text-xl font-light text-white tracking-tight">Discord Bot</h1>
      </div>
      <div className="rounded-2xl p-12 text-center border" style={{ background: sf, borderColor: bd }}>
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)' }}>
          <XCircle className="w-10 h-10" style={{ color: '#f87171' }} strokeWidth={1} />
        </div>
        <h3 className="text-xl font-light text-white mb-1">Bot Desconectado</h3>
        <p className="text-sm font-light mb-8" style={{ color: mt }}>
          {isCEO ? 'Ingresa el token para iniciar el bot.' : 'Contacta al CEO para iniciar el bot.'}
        </p>
        {isCEO && (
          <div className="max-w-sm mx-auto space-y-3">
            <input type="password" value={token} onChange={e => setToken(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleStartBot()}
              placeholder="Token del bot..."
              className="w-full px-4 py-2.5 rounded-xl text-sm font-light font-mono outline-none"
              style={{ background: sc, border: `1px solid ${bd}`, color: 'white' }} />
            <button onClick={handleStartBot} disabled={starting || !token.trim()}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-light hover:opacity-90 disabled:opacity-40 transition-all"
              style={{ background: '#fff', color: '#000' }}>
              {starting ? <><RefreshCw className="w-4 h-4 animate-spin" />Iniciando...</> : <><Play className="w-4 h-4" />Iniciar Bot</>}
            </button>
          </div>
        )}
        {error && (
          <div className="mt-4 p-3 rounded-xl flex items-start gap-2 max-w-sm mx-auto"
            style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)' }}>
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
            <p className="text-red-400 text-sm font-light text-left">{error}</p>
          </div>
        )}
      </div>
    </div>
  );

  const isOnline = botData.status === 'online' || botData.status === 'ready';
  const botName  = botData.username || 'Bot';
  const botTag   = botData.discriminator ? `${botName}#${botData.discriminator}` : botName;

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center"
              style={{ background: 'hsl(var(--muted))', border: `1px solid ${bd}` }}>
              {botData.avatar
                ? <img src={botData.avatar} alt={botName} className="w-full h-full object-cover" />
                : <Bot className="w-6 h-6" style={{ color: mt }} strokeWidth={1.5} />}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2"
              style={{ borderColor: 'hsl(var(--background))' }} />
          </div>
          <div>
            <h2 className="text-lg font-light text-white leading-tight">{botTag}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusPill online={isOnline} />
              {maintenance?.active && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-light"
                  style={{ background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.2)', color: '#fb923c' }}>
                  <Wrench className="w-2.5 h-2.5" strokeWidth={2} /> Mantenimiento
                </span>
              )}
              {botData.id && <span className="text-[11px] font-mono" style={{ color: mt }}>ID: {botData.id}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-light" style={{ color: mt }}>Auto-refresh 30s</span>
          <button onClick={handleRefresh} disabled={refreshing}
            className="w-9 h-9 rounded-xl flex items-center justify-center border transition-all hover:bg-white/[0.05]"
            style={{ borderColor: bd, color: mt }}>
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* ── Stats rápidas ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Uptime"     value={formatUptime(botData.uptime)}                             icon={<Clock className="w-5 h-5" />} />
        <MiniStat label="Latencia"   value={botData.ping ? `${botData.ping}ms` : '—'}                 icon={<Wifi className="w-5 h-5" />} accent={getPingColor(botData.ping)} />
        <MiniStat label="Servidores" value={botData.servers ?? botData.serversList?.length ?? 0}       icon={<Server className="w-5 h-5" />} />
        <MiniStat label="Usuarios"   value={(botData.users ?? 0).toLocaleString('es-PE')}             icon={<Users className="w-5 h-5" />} />
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 flex-wrap rounded-2xl p-1.5" style={{ background: sf, border: `1px solid ${bd}` }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.value;
          return (
            <button key={tab.value} onClick={() => setActiveTab(tab.value)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-light transition-all"
              style={{ background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent', color: isActive ? 'white' : mt }}>
              <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
              {tab.label}
              {'badge' in tab && tab.badge !== undefined && tab.badge > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px]"
                  style={{ background: tab.value === 'incidents' ? 'rgba(248,113,113,0.2)' : 'rgba(255,255,255,0.08)', color: tab.value === 'incidents' ? '#f87171' : mt }}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-1">

        {/* ════ ESTADO ════ */}
        {activeTab === 'status' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Info bot */}
              <div className="rounded-2xl border p-5" style={{ background: sf, borderColor: bd }}>
                <p className="text-[10px] uppercase tracking-widest font-light mb-4 flex items-center gap-1.5" style={{ color: mt }}>
                  <Bot className="w-3.5 h-3.5" /> Información del Bot
                </p>
                {[
                  { label: 'Nombre',     value: botName !== 'Bot' ? botName : null },
                  { label: 'ID',         value: botData.id || null, mono: true },
                  { label: 'Versión',    value: botData.botVersion || null },
                  { label: 'Prefijo',    value: botData.prefix || null, mono: true },
                  { label: 'Estado',     value: botData.status || null },
                  { label: 'Memoria',    value: botData.memoryUsage ? `${botData.memoryUsage} MB` : null },
                ].map(({ label, value, mono }) => (
                  <div key={label} className="flex justify-between items-center py-2.5 border-b last:border-0" style={{ borderColor: bd }}>
                    <span className="text-sm font-light" style={{ color: mt }}>{label}</span>
                    <span className={`text-sm font-light ${mono ? 'font-mono text-xs' : ''}`}
                      style={{ color: value ? 'white' : mt }}>{value || '—'}</span>
                  </div>
                ))}
              </div>

              {/* Rendimiento */}
              <div className="rounded-2xl border p-5 space-y-4" style={{ background: sf, borderColor: bd }}>
                <p className="text-[10px] uppercase tracking-widest font-light flex items-center gap-1.5" style={{ color: mt }}>
                  <BarChart3 className="w-3.5 h-3.5" /> Rendimiento
                </p>
                {[
                  { label: 'Latencia WebSocket', value: botData.ping ?? 0, max: 500, unit: 'ms' },
                  { label: 'Memoria utilizada',  value: botData.memoryUsage ?? 0, max: 512, unit: 'MB', color: '#60a5fa' },
                  { label: 'Servidores',         value: botData.servers ?? 0, max: 100, color: '#c084fc' },
                ].map(({ label, value, max, unit = '', color = '#4ade80' }) => {
                  const pct = Math.min(100, Math.round((value / max) * 100));
                  const barColor = pct > 80 ? '#f87171' : pct > 60 ? '#facc15' : color;
                  return (
                    <div key={label} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-light">
                        <span style={{ color: mt }}>{label}</span>
                        <span style={{ color: 'rgba(255,255,255,0.6)' }}>{value}{unit} <span style={{ color: mt }}>/ {max}{unit}</span></span>
                      </div>
                      <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: barColor }} />
                      </div>
                    </div>
                  );
                })}
                <div className="pt-2 border-t flex items-center justify-between" style={{ borderColor: bd }}>
                  <span className="text-sm font-light flex items-center gap-2" style={{ color: mt }}>
                    <Zap className="w-4 h-4" style={{ color: '#facc15' }} strokeWidth={1.5} />
                    Comandos registrados
                  </span>
                  <span className="text-sm font-light text-white">{commandsData?.total ?? '—'}</span>
                </div>
              </div>
            </div>

            {/* Seguridad */}
            <div className="rounded-2xl border p-5" style={{ background: sf, borderColor: bd }}>
              <p className="text-[10px] uppercase tracking-widest font-light mb-4 flex items-center gap-1.5" style={{ color: mt }}>
                <Shield className="w-3.5 h-3.5" /> Seguridad & Capacidades
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {['Token encriptado', 'Modo privilegiado', 'Rate limit activo', 'Auto-reconnect'].map(label => (
                  <div key={label} className="flex items-center gap-2 p-3 rounded-xl"
                    style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.12)' }}>
                    <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#4ade80' }} strokeWidth={1.5} />
                    <span className="text-xs font-light" style={{ color: 'rgba(255,255,255,0.7)' }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ════ SERVIDORES — diseño compacto ════ */}
        {activeTab === 'servers' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-light uppercase tracking-widest" style={{ color: mt }}>
                {botData.serversList?.length ?? 0} servidores conectados
              </p>
            </div>
            {!botData.serversList?.length ? (
              <div className="rounded-2xl border py-16 text-center" style={{ background: sf, borderColor: bd }}>
                <Server className="w-10 h-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} strokeWidth={1} />
                <p className="text-sm font-light" style={{ color: mt }}>Sin servidores conectados</p>
              </div>
            ) : (
              <div className="rounded-2xl overflow-hidden border" style={{ background: sf, borderColor: bd }}>
                {/* Header tabla */}
                <div className="grid grid-cols-12 gap-3 px-4 py-3 border-b"
                  style={{ background: 'rgba(255,255,255,0.02)', borderColor: bd }}>
                  <span className="col-span-5 text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>Servidor</span>
                  <span className="col-span-2 text-[10px] uppercase tracking-widest font-light hidden sm:block" style={{ color: mt }}>Miembros</span>
                  <span className="col-span-2 text-[10px] uppercase tracking-widest font-light hidden md:block" style={{ color: mt }}>Boosts</span>
                  <span className="col-span-3 text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>ID</span>
                </div>
                <div className="divide-y" style={{ borderColor: bd }}>
                  {botData.serversList.map(server => (
                    <div key={server.id} className="grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-white/[0.02] transition-colors">
                      {/* Nombre + icon */}
                      <div className="col-span-5 flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
                          style={{ background: 'hsl(var(--muted))', border: `1px solid ${bd}` }}>
                          {server.icon
                            ? <img src={server.icon} alt={server.name} className="w-full h-full object-cover" />
                            : <Server className="w-4 h-4" style={{ color: mt }} strokeWidth={1.5} />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-white text-sm font-light truncate">{server.name}</p>
                          {server.boostLevel && server.boostLevel > 0 && (
                            <span className="text-[10px] font-light" style={{ color: '#c084fc' }}>Nivel {server.boostLevel}</span>
                          )}
                        </div>
                      </div>
                      {/* Miembros */}
                      <div className="col-span-2 hidden sm:flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 flex-shrink-0" style={{ color: mt }} strokeWidth={1.5} />
                        <span className="text-sm font-light text-white">{server.memberCount?.toLocaleString('es-PE') ?? '—'}</span>
                      </div>
                      {/* Boosts */}
                      <div className="col-span-2 hidden md:block">
                        <span className="text-sm font-light" style={{ color: server.boostCount ? '#c084fc' : mt }}>
                          {server.boostCount ?? 0}
                        </span>
                      </div>
                      {/* ID */}
                      <div className="col-span-3">
                        <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>{server.id}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════ UPTIME — 90 días ════ */}
        {activeTab === 'uptime' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-light uppercase tracking-widest" style={{ color: mt }}>Historial 90 días</p>
              <button onClick={fetchUptime} disabled={loadingUptime}
                className="w-8 h-8 rounded-xl flex items-center justify-center border transition-all hover:bg-white/[0.05]"
                style={{ borderColor: bd, color: mt }}>
                <RefreshCw className={`w-3.5 h-3.5 ${loadingUptime ? 'animate-spin' : ''}`} strokeWidth={1.5} />
              </button>
            </div>

            {loadingUptime ? (
              <Skel className="h-20" />
            ) : uptimeData.length > 0 ? (
              <>
                {/* Barra de 90 días */}
                <div className="rounded-2xl border p-5" style={{ background: sf, borderColor: bd }}>
                  <div className="flex items-end gap-px overflow-hidden" style={{ height: '48px' }}>
                    {uptimeData.map((day) => {
                      const color = UPTIME_STATUS_COLOR[day.status] ?? '#3f3f46';
                      const h = day.uptimePct !== null ? Math.max(4, Math.round((day.uptimePct / 100) * 48)) : 8;
                      return (
                        <div key={day.date} className="flex-1 group relative cursor-default"
                          style={{ height: '48px', display: 'flex', alignItems: 'flex-end' }}>
                          <div className="w-full rounded-sm transition-opacity group-hover:opacity-80"
                            style={{ height: `${h}px`, background: color }} />
                          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 pointer-events-none">
                            <div className="text-[10px] font-light px-2 py-1 rounded-lg whitespace-nowrap"
                              style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}>
                              {day.date}<br />
                              {day.uptimePct !== null ? `${day.uptimePct}%` : 'Sin datos'}
                              {day.avgPing ? ` · ${day.avgPing}ms` : ''}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs font-light" style={{ color: mt }}>90 días atrás</span>
                    <span className="text-xs font-light" style={{ color: mt }}>Hoy</span>
                  </div>
                </div>

                {/* Leyenda */}
                <div className="flex flex-wrap gap-3">
                  {Object.entries(UPTIME_STATUS_COLOR).filter(([k]) => k !== 'desconocido').map(([status, color]) => (
                    <div key={status} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
                      <span className="text-xs font-light capitalize" style={{ color: mt }}>
                        {status.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Resumen uptime */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {(() => {
                    const valid = uptimeData.filter(d => d.uptimePct !== null);
                    const avg = valid.length > 0 ? valid.reduce((a, d) => a + (d.uptimePct ?? 0), 0) / valid.length : 0;
                    const today = uptimeData[uptimeData.length - 1];
                    const downDays = uptimeData.filter(d => d.status === 'caida_mayor' || d.status === 'caida_parcial').length;
                    const avgPing = valid.filter(d => d.avgPing).reduce((a, d, _, arr) => a + (d.avgPing ?? 0) / arr.length, 0);
                    return [
                      { label: 'Uptime promedio', value: `${avg.toFixed(2)}%`, color: avg > 99 ? '#4ade80' : avg > 95 ? '#facc15' : '#f87171' },
                      { label: 'Hoy',             value: today?.uptimePct !== null ? `${today.uptimePct}%` : '—', color: '#60a5fa' },
                      { label: 'Días con caída',  value: downDays, color: downDays > 0 ? '#f87171' : '#4ade80' },
                      { label: 'Latencia media',  value: avgPing > 0 ? `${Math.round(avgPing)}ms` : '—', color: getPingColor(avgPing) },
                    ];
                  })().map(({ label, value, color }) => (
                    <div key={label} className="p-4 rounded-2xl border text-center" style={{ background: sf, borderColor: bd }}>
                      <p className="text-2xl font-light" style={{ color }}>{value}</p>
                      <p className="text-[10px] uppercase tracking-widest font-light mt-1" style={{ color: mt }}>{label}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-2xl border py-16 text-center" style={{ background: sf, borderColor: bd }}>
                <TrendingUp className="w-10 h-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} strokeWidth={1} />
                <p className="text-sm font-light" style={{ color: mt }}>No hay datos de uptime</p>
                <button onClick={fetchUptime} className="mt-3 px-4 py-2 rounded-xl text-xs font-light"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }}>Cargar</button>
              </div>
            )}
          </div>
        )}

        {/* ════ INCIDENTES ════ */}
        {activeTab === 'incidents' && (
          <div className="space-y-4">

            {/* Sub-navegación Sistema / Bugs */}
            <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${bd}` }}>
              <button onClick={() => setIncidentView('sistema')}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-light transition-all"
                style={{ background: incidentView === 'sistema' ? 'rgba(255,255,255,0.08)' : 'transparent', color: incidentView === 'sistema' ? 'white' : mt }}>
                <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} />
                Sistema
                {incidents.filter(i => i.status !== 'resuelto').length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px]"
                    style={{ background: 'rgba(248,113,113,0.2)', color: '#f87171' }}>
                    {incidents.filter(i => i.status !== 'resuelto').length}
                  </span>
                )}
              </button>
              <button onClick={() => { setIncidentView('bugs'); fetchBugReports(); }}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-light transition-all"
                style={{ background: incidentView === 'bugs' ? 'rgba(255,255,255,0.08)' : 'transparent', color: incidentView === 'bugs' ? 'white' : mt }}>
                <Terminal className="w-3.5 h-3.5" strokeWidth={1.5} />
                Reportes de Bugs
                {bugReports.filter(b => b.estado === 'abierto').length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px]"
                    style={{ background: 'rgba(251,146,60,0.2)', color: '#fb923c' }}>
                    {bugReports.filter(b => b.estado === 'abierto').length}
                  </span>
                )}
              </button>
            </div>

            {/* ── SISTEMA ── */}
            {incidentView === 'sistema' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-light uppercase tracking-widest" style={{ color: mt }}>{incidents.length} incidentes</p>
                  {isCEO && (
                    <button onClick={() => setShowIncidentForm(!showIncidentForm)}
                      className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-light transition-all hover:opacity-90"
                      style={{ background: showIncidentForm ? 'rgba(248,113,113,0.1)' : '#fff', color: showIncidentForm ? '#f87171' : '#000' }}>
                      {showIncidentForm ? <XCircle className="w-3.5 h-3.5" strokeWidth={1.5} /> : <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />}
                      {showIncidentForm ? 'Cancelar' : 'Nuevo Incidente'}
                    </button>
                  )}
                </div>
                {isCEO && showIncidentForm && (
                  <div className="rounded-2xl border p-5 space-y-4" style={{ background: sf, borderColor: 'rgba(248,113,113,0.3)' }}>
                    <p className="text-sm font-light text-white flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400" strokeWidth={1.5} /> Reportar Incidente
                    </p>
                    <input value={incidentForm.title} onChange={e => setIncidentForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Título del incidente..." className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none"
                      style={{ background: sc, border: `1px solid ${bd}`, color: 'white' }} />
                    <div className="relative">
                      <select value={incidentForm.impact} onChange={e => setIncidentForm(f => ({ ...f, impact: e.target.value }))}
                        className={`${selectCls} pr-9`} style={{ ...selectSt, color: IMPACT_CONFIG[incidentForm.impact]?.color ?? 'white' }}>
                        {Object.entries(IMPACT_CONFIG).map(([k, v]) => (
                          <option key={k} value={k} style={{ background: '#111', color: v.color }}>{v.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: mt }} strokeWidth={1.5} />
                    </div>
                    <textarea value={incidentForm.message} onChange={e => setIncidentForm(f => ({ ...f, message: e.target.value }))}
                      rows={3} placeholder="Descripción..." className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none resize-none"
                      style={{ background: sc, border: `1px solid ${bd}`, color: 'white' }} />
                    <button onClick={handleCreateIncident} disabled={savingIncident || !incidentForm.title.trim()}
                      className="px-5 py-2.5 rounded-xl text-sm font-light hover:opacity-90 disabled:opacity-40 transition-all"
                      style={{ background: '#f87171', color: '#000' }}>
                      {savingIncident ? 'Publicando...' : 'Publicar Incidente'}
                    </button>
                  </div>
                )}
                {loadingIncidents ? (
                  <div className="space-y-2">{[...Array(3)].map((_, i) => <Skel key={i} className="h-20" />)}</div>
                ) : incidents.length === 0 ? (
                  <div className="rounded-2xl border py-16 text-center" style={{ background: sf, borderColor: bd }}>
                    <CheckCircle2 className="w-10 h-10 mx-auto mb-3" style={{ color: '#4ade80', opacity: 0.4 }} strokeWidth={1} />
                    <p className="text-sm font-light" style={{ color: mt }}>Sin incidentes activos</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {incidents.map(incident => {
                      const sc2 = INCIDENT_STATUS[incident.status] ?? { label: incident.status, color: '#9ca3af' };
                      const ic  = IMPACT_CONFIG[incident.impact]   ?? { label: incident.impact,  color: '#9ca3af' };
                      const isOpen = selectedIncident?.id === incident.id;
                      return (
                        <div key={incident.id} className="rounded-2xl border overflow-hidden" style={{ background: sf, borderColor: bd }}>
                          <div className="flex items-start justify-between p-4 gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-white text-sm font-light">{incident.title}</span>
                                <span className="text-[10px] font-light px-2 py-0.5 rounded-full"
                                  style={{ background: sc2.color + '18', color: sc2.color, border: `1px solid ${sc2.color}30` }}>{sc2.label}</span>
                                <span className="text-[10px] font-light px-2 py-0.5 rounded-full"
                                  style={{ background: ic.color + '18', color: ic.color, border: `1px solid ${ic.color}30` }}>{ic.label}</span>
                              </div>
                              <p className="text-xs font-light" style={{ color: mt }}>
                                {new Date(incident.createdAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                {incident.resolvedAt && ` · Resuelto ${new Date(incident.resolvedAt).toLocaleDateString('es-PE', { hour: '2-digit', minute: '2-digit' })}`}
                              </p>
                            </div>
                            {isCEO && (
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button onClick={() => { setSelectedIncident(isOpen ? null : incident); setUpdateForm({ status: 'monitoreando', message: '' }); }}
                                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:bg-white/[0.06]" style={{ color: mt }}>
                                  <Edit3 className="w-3.5 h-3.5" strokeWidth={1.5} />
                                </button>
                                <button onClick={() => handleDeleteIncident(incident.id)}
                                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:bg-red-500/10" style={{ color: mt }}
                                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#f87171'}
                                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = mt}>
                                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                                </button>
                              </div>
                            )}
                          </div>
                          {incident.updates?.length > 0 && (
                            <div className="border-t px-4 py-3 space-y-2" style={{ borderColor: bd, background: 'rgba(255,255,255,0.01)' }}>
                              {incident.updates.slice(0, 2).map(u => (
                                <div key={u.id} className="flex items-start gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: INCIDENT_STATUS[u.status]?.color ?? '#6b7280' }} />
                                  <div>
                                    <p className="text-xs font-light" style={{ color: 'rgba(255,255,255,0.7)' }}>{u.body}</p>
                                    <p className="text-[10px] font-light mt-0.5" style={{ color: mt }}>
                                      {new Date(u.createdAt).toLocaleDateString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {isCEO && isOpen && (
                            <div className="border-t p-4 space-y-3" style={{ borderColor: bd, background: 'rgba(255,255,255,0.02)' }}>
                              <div className="relative">
                                <select value={updateForm.status} onChange={e => setUpdateForm(f => ({ ...f, status: e.target.value }))}
                                  className={`${selectCls} pr-9`} style={{ ...selectSt, color: INCIDENT_STATUS[updateForm.status]?.color ?? 'white' }}>
                                  {Object.entries(INCIDENT_STATUS).map(([k, v]) => (
                                    <option key={k} value={k} style={{ background: '#111', color: v.color }}>{v.label}</option>
                                  ))}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: mt }} strokeWidth={1.5} />
                              </div>
                              <textarea value={updateForm.message} onChange={e => setUpdateForm(f => ({ ...f, message: e.target.value }))}
                                rows={2} placeholder="Actualización del incidente..."
                                className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none resize-none"
                                style={{ background: sc, border: `1px solid ${bd}`, color: 'white' }} />
                              <button onClick={handleUpdateIncident} disabled={savingIncident || !updateForm.message.trim()}
                                className="px-4 py-2 rounded-xl text-xs font-light hover:opacity-90 disabled:opacity-40 transition-all"
                                style={{ background: '#fff', color: '#000' }}>
                                {savingIncident ? 'Guardando...' : 'Publicar actualización'}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── REPORTES DE BUGS ── */}
            {incidentView === 'bugs' && (
              <div className="space-y-4">
                {/* Filtros */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex gap-1 flex-wrap">
                    {([
                      { k: 'all', label: 'Todos' },
                      { k: 'abierto', label: 'Abiertos' },
                      { k: 'revisando', label: 'Revisando' },
                      { k: 'en_proceso', label: 'En proceso' },
                      { k: 'resuelto', label: 'Resueltos' },
                      { k: 'invalido', label: 'Inválidos' },
                    ]).map(({ k, label }) => {
                      const count = k === 'all' ? bugReports.length : bugReports.filter(b => b.estado === k).length;
                      return (
                        <button key={k} onClick={() => setBugFilter(k)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-light transition-all"
                          style={{
                            background: bugFilter === k ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)',
                            color: bugFilter === k ? 'white' : mt,
                            border: `1px solid ${bugFilter === k ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)'}`,
                          }}>
                          {label}
                          {count > 0 && <span className="text-[10px] px-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>{count}</span>}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={fetchBugReports} disabled={loadingBugs}
                    className="w-8 h-8 rounded-xl flex items-center justify-center border transition-all hover:bg-white/[0.05] ml-auto"
                    style={{ borderColor: bd, color: mt }}>
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingBugs ? 'animate-spin' : ''}`} strokeWidth={1.5} />
                  </button>
                </div>

                {/* Stats de bugs */}
                {bugReports.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {Object.entries(BUG_ESTADO).map(([k, v]) => {
                      const count = bugReports.filter(b => b.estado === k).length;
                      return (
                        <div key={k} className="p-3 rounded-xl text-center cursor-pointer transition-all hover:opacity-80"
                          onClick={() => setBugFilter(bugFilter === k ? 'all' : k)}
                          style={{
                            background: bugFilter === k ? v.color + '18' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${bugFilter === k ? v.color + '40' : 'rgba(255,255,255,0.06)'}`,
                          }}>
                          <p className="text-xl font-light" style={{ color: v.color }}>{count}</p>
                          <p className="text-[9px] uppercase tracking-widest font-light mt-0.5" style={{ color: mt }}>{v.label}</p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Detalle o lista */}
                {loadingBugs ? (
                  <div className="space-y-2">{[...Array(4)].map((_, i) => <Skel key={i} className="h-14" />)}</div>
                ) : bugReports.length === 0 ? (
                  <div className="rounded-2xl border py-16 text-center" style={{ background: sf, borderColor: bd }}>
                    <Terminal className="w-10 h-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} strokeWidth={1} />
                    <p className="text-sm font-light" style={{ color: mt }}>Sin reportes de bugs</p>
                    <p className="text-xs font-light mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>Los usuarios usan /bugreport en Discord</p>
                  </div>
                ) : selectedBug ? (
                  /* Detalle */
                  <div className="space-y-4">
                    <button onClick={() => { setSelectedBug(null); setBugImageIndex(0); }}
                      className="flex items-center gap-2 text-xs font-light transition-all hover:opacity-80" style={{ color: mt }}>
                      <ChevronRight className="w-3.5 h-3.5 rotate-180" strokeWidth={1.5} /> Volver a la lista
                    </button>
                    <div className="rounded-2xl border overflow-hidden"
                      style={{ background: sf, borderColor: (BUG_SEVERIDAD[selectedBug.severidad]?.color ?? '#6b7280') + '40' }}>
                      <div className="p-5 border-b" style={{ borderColor: bd }}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <span className="text-xs font-mono px-2 py-0.5 rounded-lg"
                                style={{ background: 'rgba(255,255,255,0.06)', color: mt }}>{selectedBug.reportId}</span>
                              <span className="text-[10px] font-light px-2 py-1 rounded-full"
                                style={{ background: (BUG_SEVERIDAD[selectedBug.severidad]?.color ?? '#6b7280') + '18', color: BUG_SEVERIDAD[selectedBug.severidad]?.color ?? '#6b7280', border: `1px solid ${BUG_SEVERIDAD[selectedBug.severidad]?.color ?? '#6b7280'}30` }}>
                                {BUG_SEVERIDAD[selectedBug.severidad]?.label ?? selectedBug.severidad}
                              </span>
                              <span className="text-[10px] font-light px-2 py-1 rounded-full"
                                style={{ background: (BUG_ESTADO[selectedBug.estado]?.color ?? '#6b7280') + '18', color: BUG_ESTADO[selectedBug.estado]?.color ?? '#6b7280', border: `1px solid ${BUG_ESTADO[selectedBug.estado]?.color ?? '#6b7280'}30` }}>
                                {BUG_ESTADO[selectedBug.estado]?.label ?? selectedBug.estado}
                              </span>
                            </div>
                            <h3 className="text-white font-light text-base">{selectedBug.titulo}</h3>
                            <div className="flex items-center gap-3 mt-2 text-xs font-light flex-wrap" style={{ color: mt }}>
                              <span>👤 {selectedBug.usuarioTag}</span>
                              {selectedBug.servidorNombre && <span>🏠 {selectedBug.servidorNombre}</span>}
                              <span>📅 {toDate(selectedBug.createdAt)?.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'}</span>
                            </div>
                          </div>
                          {isCEO && (
                            <button onClick={() => handleDeleteBugReport(selectedBug.reportId)}
                              className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:bg-red-500/10 flex-shrink-0" style={{ color: mt }}
                              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#f87171'}
                              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = mt}>
                              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="p-5 space-y-4">
                        <div>
                          <p className="text-[10px] uppercase tracking-widest font-light mb-2" style={{ color: mt }}>Descripción</p>
                          <p className="text-sm font-light leading-relaxed" style={{ color: 'rgba(255,255,255,0.8)' }}>{selectedBug.descripcion}</p>
                        </div>
                        {selectedBug.pasos && (
                          <div>
                            <p className="text-[10px] uppercase tracking-widest font-light mb-2" style={{ color: mt }}>Pasos para reproducir</p>
                            <pre className="text-xs font-light leading-relaxed whitespace-pre-wrap px-3 py-2.5 rounded-xl"
                              style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${bd}`, color: 'rgba(255,255,255,0.7)' }}>
                              {selectedBug.pasos}
                            </pre>
                          </div>
                        )}
                        {selectedBug.esperadoVsActual && (
                          <div>
                            <p className="text-[10px] uppercase tracking-widest font-light mb-2" style={{ color: mt }}>Esperado vs Actual</p>
                            <pre className="text-xs font-light leading-relaxed whitespace-pre-wrap px-3 py-2.5 rounded-xl"
                              style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${bd}`, color: 'rgba(255,255,255,0.7)' }}>
                              {selectedBug.esperadoVsActual}
                            </pre>
                          </div>
                        )}
                        {/* Imágenes */}
                        {selectedBug.imagenes && selectedBug.imagenes.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-widest font-light mb-2" style={{ color: mt }}>
                              Capturas ({bugImageIndex + 1} / {selectedBug.imagenes.length})
                            </p>
                            <div className="rounded-xl overflow-hidden border" style={{ borderColor: bd }}>
                              <img src={selectedBug.imagenes[bugImageIndex]} alt={`Captura ${bugImageIndex + 1}`}
                                className="w-full object-contain max-h-72" style={{ background: '#000' }} />
                            </div>
                            {selectedBug.imagenes.length > 1 && (
                              <div className="flex items-center gap-2 mt-2">
                                <button onClick={() => setBugImageIndex(i => Math.max(0, i - 1))} disabled={bugImageIndex === 0}
                                  className="flex-1 py-2 rounded-xl text-xs font-light transition-all disabled:opacity-30"
                                  style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${bd}`, color: 'white' }}>
                                  ◀ Anterior
                                </button>
                                <div className="flex gap-1">
                                  {selectedBug.imagenes.map((_, i) => (
                                    <button key={i} onClick={() => setBugImageIndex(i)}
                                      className="w-2 h-2 rounded-full transition-all"
                                      style={{ background: i === bugImageIndex ? 'white' : 'rgba(255,255,255,0.2)' }} />
                                  ))}
                                </div>
                                <button onClick={() => setBugImageIndex(i => Math.min(selectedBug.imagenes!.length - 1, i + 1))}
                                  disabled={bugImageIndex >= selectedBug.imagenes.length - 1}
                                  className="flex-1 py-2 rounded-xl text-xs font-light transition-all disabled:opacity-30"
                                  style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${bd}`, color: 'white' }}>
                                  Siguiente ▶
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        {/* Cambiar estado */}
                        {isCEO && (
                          <div className="pt-3 border-t space-y-2" style={{ borderColor: bd }}>
                            <p className="text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>Cambiar estado</p>
                            <div className="flex flex-wrap gap-2">
                              {(BUG_TRANSITIONS[selectedBug.estado] ?? []).map(nuevoEstado => {
                                const meta = BUG_ESTADO[nuevoEstado];
                                return (
                                  <button key={nuevoEstado}
                                    onClick={() => handleBugStatusChange(selectedBug, nuevoEstado)}
                                    disabled={savingBugStatus}
                                    className="px-3.5 py-2 rounded-xl text-xs font-light transition-all hover:opacity-90 disabled:opacity-40"
                                    style={{ background: meta.color + '15', color: meta.color, border: `1px solid ${meta.color}30` }}>
                                    {savingBugStatus ? '...' : `→ ${meta.label}`}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Lista */
                  <div className="rounded-2xl overflow-hidden border" style={{ background: sf, borderColor: bd }}>
                    <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b"
                      style={{ background: 'rgba(255,255,255,0.02)', borderColor: bd }}>
                      <span className="col-span-1 text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>Sev</span>
                      <span className="col-span-4 text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>Título</span>
                      <span className="col-span-2 text-[10px] uppercase tracking-widest font-light hidden sm:block" style={{ color: mt }}>Usuario</span>
                      <span className="col-span-2 text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>Estado</span>
                      <span className="col-span-2 text-[10px] uppercase tracking-widest font-light hidden md:block" style={{ color: mt }}>Fecha</span>
                      <span className="col-span-1 text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>Imgs</span>
                    </div>
                    <div className="divide-y" style={{ borderColor: bd }}>
                      {bugReports.filter(b => bugFilter === 'all' || b.estado === bugFilter).map(bug => {
                        const sev  = BUG_SEVERIDAD[bug.severidad] ?? BUG_SEVERIDAD['medio'];
                        const est  = BUG_ESTADO[bug.estado]       ?? BUG_ESTADO['abierto'];
                        const imgs = bug.imagenes?.length ?? 0;
                        return (
                          <div key={bug.reportId}
                            className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-white/[0.02] transition-colors cursor-pointer"
                            onClick={() => { setSelectedBug(bug); setBugImageIndex(0); }}>
                            <div className="col-span-1">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ background: sev.color }} title={sev.label} />
                            </div>
                            <div className="col-span-4 min-w-0">
                              <p className="text-white text-xs font-light truncate">{bug.titulo}</p>
                              <p className="text-[10px] font-mono truncate" style={{ color: mt }}>{bug.reportId}</p>
                            </div>
                            <div className="col-span-2 hidden sm:block">
                              <p className="text-xs font-light truncate" style={{ color: mt }}>{bug.usuarioTag}</p>
                            </div>
                            <div className="col-span-2">
                              <span className="text-[10px] font-light px-2 py-0.5 rounded-full"
                                style={{ background: est.color + '18', color: est.color }}>{est.label}</span>
                            </div>
                            <div className="col-span-2 hidden md:block">
                              <p className="text-[10px] font-light" style={{ color: mt }}>
                                {toDate(bug.createdAt)?.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) ?? '—'}
                              </p>
                            </div>
                            <div className="col-span-1">
                              {imgs > 0
                                ? <span className="text-[10px] font-light" style={{ color: '#60a5fa' }}>📷 {imgs}</span>
                                : <span style={{ color: 'rgba(255,255,255,0.15)' }}>—</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ════ COMANDOS ════ */}

        {activeTab === 'commands' && (
          <div className="space-y-4">
            {commandsData && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Total',    value: commandsData.total,  color: 'white'   },
                  { label: 'Globales', value: commandsData.global, color: 'white'   },
                  { label: 'Guild',    value: commandsData.guild,  color: '#c084fc' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="p-4 rounded-2xl border text-center" style={{ background: sf, borderColor: bd }}>
                    <p className="text-3xl font-light mb-1" style={{ color }}>{value}</p>
                    <p className="text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>{label}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 items-center flex-wrap">
              <input value={commandSearch} onChange={e => setCommandSearch(e.target.value)}
                placeholder="Buscar comando..." className="px-3.5 py-2 rounded-xl text-sm font-light outline-none max-w-xs"
                style={{ background: sc, border: `1px solid ${bd}`, color: 'white' }} />
              <div className="flex gap-1">
                {(['all', 'global', 'guild'] as const).map(f => (
                  <button key={f} onClick={() => setCommandFilter(f)}
                    className="px-3 py-1.5 rounded-xl text-xs font-light transition-all"
                    style={{ background: commandFilter === f ? '#fff' : sc, color: commandFilter === f ? '#000' : mt, border: `1px solid ${bd}` }}>
                    {f === 'all' ? 'Todos' : f === 'global' ? 'Globales' : 'Guild'}
                  </button>
                ))}
              </div>
              <button onClick={() => fetchCommands()} disabled={loadingCommands}
                className="w-8 h-8 rounded-xl flex items-center justify-center border transition-all hover:bg-white/[0.05] ml-auto"
                style={{ borderColor: bd, color: mt }}>
                <RefreshCw className={`w-3.5 h-3.5 ${loadingCommands ? 'animate-spin' : ''}`} strokeWidth={1.5} />
              </button>
            </div>
            {loadingCommands ? (
              <div className="space-y-2">{[...Array(4)].map((_, i) => <Skel key={i} className="h-16" />)}</div>
            ) : filteredCommands.length === 0 ? (
              <div className="text-center py-12">
                <Command className="w-8 h-8 mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.1)' }} strokeWidth={1} />
                <p className="text-sm font-light" style={{ color: mt }}>
                  {!commandsData ? 'Cargando...' : commandSearch ? `Sin resultados para "${commandSearch}"` : 'Sin comandos'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredCommands.map(cmd => <CommandCard key={cmd.id} cmd={cmd} />)}
                <p className="text-xs font-light text-right pt-2" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  {filteredCommands.length} de {commandsData?.total ?? 0} comandos
                </p>
              </div>
            )}
          </div>
        )}

        {/* ════ MENSAJES (CEO) ════ */}
        {isCEO && activeTab === 'messages' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 rounded-2xl border p-5 space-y-4" style={{ background: sf, borderColor: bd }}>
              <p className="text-white font-light flex items-center gap-2 text-sm">
                <Send className="w-4 h-4" style={{ color: mt }} strokeWidth={1.5} /> Enviar Mensaje
              </p>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>Servidor</label>
                <div className="relative">
                  <select value={selectedServer} onChange={e => handleServerSelect(e.target.value)} className={`${selectCls} pr-9`} style={selectSt}>
                    <option value="">Seleccionar servidor...</option>
                    {botData.serversList?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: mt }} strokeWidth={1.5} />
                </div>
              </div>
              {selectedServer && (
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-widest font-light flex items-center gap-1" style={{ color: mt }}>
                    <Hash className="w-3 h-3" /> Canal {loadingChannels && <RefreshCw className="w-3 h-3 animate-spin ml-1" />}
                  </label>
                  <div className="relative">
                    <select value={selectedChannel} onChange={e => setSelectedChannel(e.target.value)}
                      disabled={loadingChannels} className={`${selectCls} pr-9`} style={{ ...selectSt, opacity: loadingChannels ? 0.4 : 1 }}>
                      <option value="">{loadingChannels ? 'Cargando...' : channels.length === 0 ? 'Sin canales' : 'Seleccionar canal...'}</option>
                      {channels.map(ch => <option key={ch.id} value={ch.id}>#{ch.name}{ch.parent ? ` (${ch.parent})` : ''}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: mt }} strokeWidth={1.5} />
                  </div>
                </div>
              )}
              {selectedChannel && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>Mensaje</label>
                    <textarea value={messageText} onChange={e => setMessageText(e.target.value)} rows={4}
                      placeholder="Escribe tu mensaje..." className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none resize-none"
                      style={{ background: sc, border: `1px solid ${bd}`, color: 'white' }} />
                  </div>
                  <button onClick={handleSendMessage} disabled={sending || !messageText.trim()}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-light hover:opacity-90 disabled:opacity-40 transition-all"
                    style={{ background: '#fff', color: '#000' }}>
                    {sending ? <><RefreshCw className="w-4 h-4 animate-spin" />Enviando...</> : <><Send className="w-4 h-4" />Enviar</>}
                  </button>
                </>
              )}
              {error && (
                <div className="p-3 rounded-xl flex items-start gap-2" style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)' }}>
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                  <p className="text-red-400 text-sm font-light">{error}</p>
                </div>
              )}
              {sendResult && (
                <div className="p-3 rounded-xl flex items-center gap-2" style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.15)' }}>
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" strokeWidth={1.5} />
                  <p className="text-green-400 text-sm font-light">Mensaje enviado correctamente</p>
                </div>
              )}
            </div>
            {/* Preview */}
            <div className="rounded-2xl border p-5" style={{ background: sf, borderColor: bd }}>
              <p className="text-[10px] uppercase tracking-widest font-light mb-3" style={{ color: mt }}>Vista previa</p>
              {messageText ? (
                <div className="p-3 rounded-xl" style={{ background: 'rgba(88,101,242,0.1)', border: '1px solid rgba(88,101,242,0.2)' }}>
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
                      style={{ background: 'hsl(var(--muted))', border: `1px solid ${bd}` }}>
                      {botData.avatar ? <img src={botData.avatar} alt="" className="w-full h-full object-cover" /> : <Bot className="w-4 h-4" style={{ color: mt }} strokeWidth={1.5} />}
                    </div>
                    <div>
                      <p className="text-sm font-light text-white mb-0.5">{botName}</p>
                      <p className="text-sm font-light whitespace-pre-wrap" style={{ color: 'rgba(255,255,255,0.8)' }}>{messageText}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs font-light italic" style={{ color: 'rgba(255,255,255,0.2)' }}>El mensaje aparecerá aquí...</p>
              )}
            </div>
          </div>
        )}

        {/* ════ MANTENIMIENTO (CEO) ════ */}
        {isCEO && activeTab === 'maintenance' && (
          <div className="space-y-4">

            {/* Sub-navegación */}
            <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${bd}` }}>
              {([
                { key: 'control', label: 'Control' },
                { key: 'history', label: 'Historial' },
                { key: 'stats',   label: 'Estadísticas' },
              ] as const).map(tab => (
                <button key={tab.key} onClick={() => setMaintView(tab.key)}
                  className="flex-1 py-2 rounded-lg text-xs font-light transition-all"
                  style={{ background: maintView === tab.key ? 'rgba(255,255,255,0.08)' : 'transparent', color: maintView === tab.key ? 'white' : mt }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── CONTROL ── */}
            {maintView === 'control' && (
              <div className="space-y-4">
                {/* Estado actual */}
                <div className="rounded-2xl border p-5" style={{
                  background: sf,
                  borderColor: maintenance?.active ? 'rgba(248,113,113,0.35)' : 'rgba(74,222,128,0.25)',
                }}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ background: maintenance?.active ? 'rgba(248,113,113,0.1)' : 'rgba(74,222,128,0.1)' }}>
                        <Wrench className="w-5 h-5" style={{ color: maintenance?.active ? '#f87171' : '#4ade80' }} strokeWidth={1.5} />
                      </div>
                      <div>
                        <p className="text-white font-light text-sm">
                          {maintenance?.active ? 'Mantenimiento Activo' : 'Sistema Operativo'}
                        </p>
                        <p className="text-xs font-light" style={{ color: mt }}>
                          {maintenance?.active
                            ? `Desde ${toDate(maintenance.startDate)?.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) ?? '—'}`
                            : 'Todos los comandos disponibles'}
                        </p>
                      </div>
                    </div>
                    <div className="w-3 h-3 rounded-full"
                      style={{ background: maintenance?.active ? '#f87171' : '#4ade80', boxShadow: `0 0 8px ${maintenance?.active ? '#f87171' : '#4ade80'}` }} />
                  </div>

                  {/* Datos del mantenimiento activo */}
                  {maintenance?.active && (
                    <div className="space-y-3 mb-4">
                      {maintenance.reason && (
                        <div className="flex items-start gap-2.5 p-3 rounded-xl"
                          style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)' }}>
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                          <div>
                            <p className="text-xs font-light text-red-300">{maintenance.reason}</p>
                            {maintenance.description && (
                              <p className="text-xs font-light mt-1" style={{ color: mt }}>{maintenance.description}</p>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        {maintenance.authorTag && (
                          <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${bd}` }}>
                            <p className="text-[10px] uppercase tracking-widest font-light mb-1" style={{ color: mt }}>Activado por</p>
                            <p className="text-xs font-light text-white">{maintenance.authorTag}</p>
                          </div>
                        )}
                        {maintenance.endDate && (
                          <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${bd}` }}>
                            <p className="text-[10px] uppercase tracking-widest font-light mb-1" style={{ color: mt }}>Fin estimado</p>
                            <p className="text-xs font-light text-white">
                              {toDate(maintenance.endDate)?.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) ?? '—'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Botón desactivar */}
                  {maintenance?.active && (
                    <button onClick={handleDeactivateMaintenance} disabled={togglingMaint}
                      className="w-full py-2.5 rounded-xl text-sm font-light hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
                      style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)' }}>
                      {togglingMaint
                        ? <><RefreshCw className="w-4 h-4 animate-spin" strokeWidth={1.5} /> Desactivando...</>
                        : <><CheckCircle2 className="w-4 h-4" strokeWidth={1.5} /> Desactivar mantenimiento</>}
                    </button>
                  )}
                </div>

                {/* Formulario activar */}
                {!maintenance?.active && (
                  <div className="rounded-2xl border p-5 space-y-4" style={{ background: sf, borderColor: bd }}>
                    <p className="text-white font-light text-sm flex items-center gap-2">
                      <Wrench className="w-4 h-4" style={{ color: '#fb923c' }} strokeWidth={1.5} />
                      Activar modo mantenimiento
                    </p>

                    {/* Razón */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>Razón</label>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(REASON_MAP).map(([key, label]) => (
                          <button key={key}
                            onClick={() => setMaintForm(f => ({ ...f, reasonKey: key }))}
                            className="px-3 py-2.5 rounded-xl text-xs font-light text-left transition-all"
                            style={{
                              background: maintForm.reasonKey === key ? 'rgba(251,146,60,0.12)' : 'rgba(255,255,255,0.03)',
                              border: `1px solid ${maintForm.reasonKey === key ? 'rgba(251,146,60,0.35)' : 'rgba(255,255,255,0.07)'}`,
                              color: maintForm.reasonKey === key ? '#fb923c' : mt,
                            }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Descripción */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>
                        Descripción detallada *
                      </label>
                      <textarea
                        value={maintForm.description}
                        onChange={e => setMaintForm(f => ({ ...f, description: e.target.value }))}
                        rows={3} placeholder="Describe qué se está haciendo..."
                        className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none resize-none"
                        style={{ background: sc, border: `1px solid ${bd}`, color: 'white' }} />
                    </div>

                    {/* Duración */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>
                        Duración estimada (opcional) — ej: 30m, 2h, 1d
                      </label>
                      <input
                        value={maintForm.durationStr}
                        onChange={e => setMaintForm(f => ({ ...f, durationStr: e.target.value }))}
                        placeholder="30m, 2h, 1d..."
                        className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none"
                        style={{ background: sc, border: `1px solid ${bd}`, color: 'white' }} />
                    </div>

                    <button onClick={handleActivateMaintenance}
                      disabled={togglingMaint || !maintForm.description.trim()}
                      className="w-full py-2.5 rounded-xl text-sm font-light hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
                      style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }}>
                      {togglingMaint
                        ? <><RefreshCw className="w-4 h-4 animate-spin" strokeWidth={1.5} /> Activando...</>
                        : <><Wrench className="w-4 h-4" strokeWidth={1.5} /> Activar mantenimiento</>}
                    </button>
                  </div>
                )}

                {/* Invite link */}
                <div className="rounded-2xl border p-5 space-y-3" style={{ background: sf, borderColor: bd }}>
                  <p className="text-white font-light flex items-center gap-2 text-sm">
                    <Link className="w-4 h-4" style={{ color: mt }} strokeWidth={1.5} /> Link de Invitación
                  </p>
                  {inviteUrl ? (
                    <div className="flex items-center gap-2">
                      <input readOnly value={inviteUrl} className="flex-1 px-3.5 py-2.5 rounded-xl text-xs font-mono font-light outline-none"
                        style={{ background: sc, border: `1px solid ${bd}`, color: 'rgba(255,255,255,0.6)' }} />
                      <a href={inviteUrl} target="_blank" rel="noopener noreferrer"
                        className="w-9 h-9 rounded-xl flex items-center justify-center border transition-all hover:bg-white/[0.05]"
                        style={{ borderColor: bd, color: mt }}>
                        <ExternalLink className="w-4 h-4" strokeWidth={1.5} />
                      </a>
                    </div>
                  ) : (
                    <button onClick={handleGetInvite}
                      className="px-4 py-2.5 rounded-xl text-sm font-light hover:opacity-90 transition-all"
                      style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${bd}`, color: 'white' }}>
                      Generar link
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── HISTORIAL ── */}
            {maintView === 'history' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-light uppercase tracking-widest" style={{ color: mt }}>
                    Últimos {maintHistory.length} registros
                  </p>
                  <button onClick={fetchMaintHistory} disabled={loadingMaintHist}
                    className="w-8 h-8 rounded-xl flex items-center justify-center border transition-all hover:bg-white/[0.05]"
                    style={{ borderColor: bd, color: mt }}>
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingMaintHist ? 'animate-spin' : ''}`} strokeWidth={1.5} />
                  </button>
                </div>
                {loadingMaintHist ? (
                  <div className="space-y-2">{[...Array(4)].map((_, i) => <Skel key={i} className="h-20" />)}</div>
                ) : maintHistory.length === 0 ? (
                  <div className="rounded-2xl border py-14 text-center" style={{ background: sf, borderColor: bd }}>
                    <Clock className="w-10 h-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} strokeWidth={1} />
                    <p className="text-sm font-light" style={{ color: mt }}>Sin historial de mantenimiento</p>
                  </div>
                ) : (
                  <div className="rounded-2xl overflow-hidden border" style={{ background: sf, borderColor: bd }}>
                    <div className="divide-y" style={{ borderColor: bd }}>
                      {maintHistory.map((entry, i) => {
                        const startD = toDate(entry.startDate);
                        return (
                          <div key={entry.id} className="p-4 hover:bg-white/[0.015] transition-colors">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-light px-2 py-0.5 rounded-full"
                                    style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}>
                                    #{maintHistory.length - i}
                                  </span>
                                  <p className="text-white text-sm font-light truncate">{entry.reason ?? '—'}</p>
                                </div>
                                {entry.description && (
                                  <p className="text-xs font-light mb-2 line-clamp-2" style={{ color: mt }}>{entry.description}</p>
                                )}
                                <div className="flex items-center gap-4 text-[10px] font-light" style={{ color: mt }}>
                                  {startD && <span>{startD.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                                  {entry.duration && <span>⏱ {formatDuration(entry.duration)}</span>}
                                  {entry.authorTag && <span>Por {entry.authorTag}</span>}
                                </div>
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

            {/* ── ESTADÍSTICAS ── */}
            {maintView === 'stats' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-light uppercase tracking-widest" style={{ color: mt }}>Estadísticas históricas</p>
                  <button onClick={() => { setMaintStats(null); fetchMaintStats(); }}
                    className="w-8 h-8 rounded-xl flex items-center justify-center border transition-all hover:bg-white/[0.05]"
                    style={{ borderColor: bd, color: mt }}>
                    <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                </div>
                {!maintStats ? (
                  <div className="rounded-2xl border py-14 text-center" style={{ background: sf, borderColor: bd }}>
                    <div className="w-6 h-6 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm font-light" style={{ color: mt }}>Cargando estadísticas...</p>
                  </div>
                ) : maintStats.total === 0 ? (
                  <div className="rounded-2xl border py-14 text-center" style={{ background: sf, borderColor: bd }}>
                    <BarChart3 className="w-10 h-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} strokeWidth={1} />
                    <p className="text-sm font-light" style={{ color: mt }}>Sin mantenimientos registrados aún</p>
                    <p className="text-xs font-light mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
                      Las estadísticas aparecerán tras el primer ciclo activar → desactivar
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Total mantenimientos', value: maintStats.total.toString(),                color: 'white'   },
                      { label: 'Duración promedio',     value: formatDuration(maintStats.averageDuration), color: '#60a5fa' },
                      { label: 'Duración mayor',        value: formatDuration(maintStats.longestDuration),  color: '#f87171' },
                      { label: 'Duración menor',        value: formatDuration(maintStats.shortestDuration), color: '#4ade80' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="rounded-2xl border p-4 text-center" style={{ background: sf, borderColor: bd }}>
                        <p className="text-2xl font-light mb-1" style={{ color }}>{value}</p>
                        <p className="text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>{label}</p>
                      </div>
                    ))}
                    {maintStats.lastMaintenance && (
                      <div className="col-span-2 rounded-2xl border p-4" style={{ background: sf, borderColor: bd }}>
                        <p className="text-[10px] uppercase tracking-widest font-light mb-1" style={{ color: mt }}>Último mantenimiento</p>
                        <p className="text-white text-sm font-light">
                          {maintStats.lastMaintenance.toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {/* ════ AUDIT LOG (CEO) ════ */}
        {isCEO && activeTab === 'audit' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <select value={auditGuildId} onChange={e => setAuditGuildId(e.target.value)}
                  className={`${selectCls} pr-9`} style={selectSt}>
                  <option value="">Seleccionar servidor...</option>
                  {botData.serversList?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: mt }} strokeWidth={1.5} />
              </div>
              <button onClick={handleFetchAudit} disabled={!auditGuildId || loadingAudit}
                className="px-4 py-2.5 rounded-xl text-sm font-light hover:opacity-90 disabled:opacity-40 transition-all"
                style={{ background: '#fff', color: '#000' }}>
                {loadingAudit ? <RefreshCw className="w-4 h-4 animate-spin" strokeWidth={1.5} /> : 'Cargar'}
              </button>
            </div>

            {loadingAudit ? (
              <div className="space-y-2">{[...Array(6)].map((_, i) => <Skel key={i} className="h-14" />)}</div>
            ) : auditEntries.length > 0 ? (
              <div className="rounded-2xl overflow-hidden border" style={{ background: sf, borderColor: bd }}>
                <div className="grid grid-cols-12 gap-3 px-5 py-3 border-b"
                  style={{ background: 'rgba(255,255,255,0.02)', borderColor: bd }}>
                  {['Acción', 'Ejecutor', 'Objetivo', 'Razón', 'Fecha'].map((h, i) => (
                    <span key={h} className={`text-[10px] uppercase tracking-widest font-light ${
                      i === 0 ? 'col-span-2' : i === 1 ? 'col-span-3' : i === 2 ? 'col-span-2' : i === 3 ? 'col-span-3' : 'col-span-2'
                    }`} style={{ color: mt }}>{h}</span>
                  ))}
                </div>
                <div className="divide-y" style={{ borderColor: bd }}>
                  {auditEntries.map(entry => (
                    <div key={entry.id} className="grid grid-cols-12 gap-3 px-5 py-3 items-center hover:bg-white/[0.01] transition-colors">
                      <div className="col-span-2">
                        <span className="text-xs font-mono px-2 py-0.5 rounded-lg"
                          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>
                          {entry.action}
                        </span>
                      </div>
                      <div className="col-span-3">
                        <p className="text-xs font-light text-white truncate">{entry.executor ?? '—'}</p>
                        {entry.executorId && <p className="text-[10px] font-mono" style={{ color: mt }}>{entry.executorId}</p>}
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs font-mono" style={{ color: mt }}>{entry.targetId ?? '—'}</p>
                      </div>
                      <div className="col-span-3">
                        <p className="text-xs font-light truncate" style={{ color: mt }}>{entry.reason ?? '—'}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-[10px] font-light" style={{ color: mt }}>
                          {new Date(entry.createdAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}
                        </p>
                        <p className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>
                          {new Date(entry.createdAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border py-14 text-center" style={{ background: sf, borderColor: bd }}>
                <Shield className="w-10 h-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} strokeWidth={1} />
                <p className="text-sm font-light" style={{ color: mt }}>
                  {auditGuildId ? 'Sin entradas en el audit log' : 'Selecciona un servidor para cargar el audit log'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ════ ACTIVIDAD (CEO) ════ */}
        {isCEO && activeTab === 'logs' && (
          <div className="rounded-2xl overflow-hidden border" style={{ background: sf, borderColor: bd }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: bd }}>
              <p className="text-sm font-light text-white flex items-center gap-2">
                <Terminal className="w-4 h-4" style={{ color: mt }} strokeWidth={1.5} /> Log de Actividad
              </p>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-light" style={{ color: mt }}>{activityLog.length} entradas</span>
                <button onClick={() => setActivityLog([])} className="text-[11px] font-light hover:text-white transition-colors" style={{ color: mt }}>Limpiar</button>
              </div>
            </div>
            <div className="p-4 font-mono text-xs space-y-1.5 max-h-[400px] overflow-y-auto">
              {activityLog.length === 0 ? (
                <p className="text-center py-10" style={{ color: mt }}>Sin actividad registrada aún</p>
              ) : activityLog.map((entry, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span style={{ color: 'rgba(255,255,255,0.2)' }}>{entry.time}</span>
                  <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                    style={{ background: entry.type === 'success' ? '#4ade80' : entry.type === 'error' ? '#f87171' : 'rgba(255,255,255,0.3)' }} />
                  <span style={{ color: entry.type === 'success' ? '#4ade80' : entry.type === 'error' ? '#f87171' : 'rgba(255,255,255,0.5)' }}>
                    {entry.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════ CONFIG (CEO) ════ */}
        {isCEO && activeTab === 'config' && (
          <div className="space-y-5 max-w-lg">
            <div className="rounded-2xl border p-5 space-y-4" style={{ background: sf, borderColor: bd }}>
              <p className="text-sm font-light text-white">Configuración del Bot</p>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-widest font-light" style={{ color: mt }}>Nombre del Bot</label>
                <div className="flex gap-2">
                  <input value={config.botName || ''} onChange={e => setConfig({ ...config, botName: e.target.value })}
                    placeholder={botData.username || 'Nombre del bot'}
                    className="flex-1 px-3.5 py-2.5 rounded-xl text-sm font-light outline-none"
                    style={{ background: sc, border: `1px solid ${bd}`, color: 'white' }} />
                  <button onClick={handleUpdateBotName} disabled={savingName || !config.botName || config.botName === botData.username}
                    className="px-4 py-2.5 rounded-xl text-sm font-light hover:opacity-90 disabled:opacity-40 transition-all"
                    style={{ background: '#fff', color: '#000' }}>
                    {savingName ? <RefreshCw className="w-4 h-4 animate-spin" strokeWidth={1.5} /> : 'Guardar'}
                  </button>
                </div>
              </div>
              {botData.token && (
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-widest font-light flex items-center gap-1" style={{ color: mt }}>
                    <Key className="w-3 h-3" /> Token actual
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-xs font-mono px-3.5 py-2.5 rounded-xl"
                      style={{ background: sc, border: `1px solid ${bd}`, color: 'rgba(255,255,255,0.4)' }}>
                      {showToken ? botData.token : maskToken(botData.token)}
                    </span>
                    <button onClick={() => setShowToken(s => !s)}
                      className="w-9 h-9 rounded-xl flex items-center justify-center border transition-all hover:bg-white/[0.05]"
                      style={{ borderColor: bd, color: mt }}>
                      {showToken ? <EyeOff className="w-4 h-4" strokeWidth={1.5} /> : <Eye className="w-4 h-4" strokeWidth={1.5} />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default DiscordBot;