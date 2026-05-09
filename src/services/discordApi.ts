// src/services/discordApi.ts

const API_URL = 'https://lunanet-moonstudio.nellyx.xyz';
const API_KEY = import.meta.env.VITE_API_KEY;

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'x-api-key': API_KEY,
});

const handleResponse = async (response: Response) => {
  const json = await response.json().catch(() => ({ error: 'Error desconocido' }));
  if (!response.ok) throw new Error(json.error || `Error ${response.status}`);
  return json.data !== undefined ? json.data : json;
};

// ─── Bot ──────────────────────────────────────────────────────────────────────

export const getBotStatus = async () => {
  const res = await fetch(`${API_URL}/api/bot/status`, { headers: { 'x-api-key': API_KEY } });
  return handleResponse(res);
};

export const getServers = async () => {
  const res = await fetch(`${API_URL}/api/bot/servers`, { headers: { 'x-api-key': API_KEY } });
  return handleResponse(res);
};

export const startBot = async (token: string) => {
  const res = await fetch(`${API_URL}/api/bot/start`, {
    method: 'POST', headers: getHeaders(), body: JSON.stringify({ token }),
  });
  return handleResponse(res);
};

export const sendBotMessage = async (guildId: string, channelId: string, message: string) => {
  const res = await fetch(`${API_URL}/api/bot/send-message`, {
    method: 'POST', headers: getHeaders(), body: JSON.stringify({ guildId, channelId, message }),
  });
  return handleResponse(res);
};

export const getServerChannels = async (guildId: string) => {
  const res = await fetch(`${API_URL}/api/bot/servers/${guildId}/channels`, { headers: { 'x-api-key': API_KEY } });
  return handleResponse(res);
};

export const getBotCommands = async (guildId?: string) => {
  const params = guildId ? `?guildId=${guildId}` : '';
  const res = await fetch(`${API_URL}/api/bot/commands${params}`, { headers: { 'x-api-key': API_KEY } });
  return handleResponse(res);
};

export const updateBotProfile = async (username: string) => {
  const res = await fetch(`${API_URL}/api/bot/profile`, {
    method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ username }),
  });
  return handleResponse(res);
};

export const getBotInvite = async () => {
  const res = await fetch(`${API_URL}/api/bot/invite`, { headers: { 'x-api-key': API_KEY } });
  return handleResponse(res);
};

export const getMaintenanceMode = async () => {
  const res = await fetch(`${API_URL}/api/bot/maintenance`, { headers: { 'x-api-key': API_KEY } });
  return handleResponse(res);
};

export const setMaintenanceMode = async (enabled: boolean, reason = '') => {
  const res = await fetch(`${API_URL}/api/bot/maintenance`, {
    method: 'POST', headers: getHeaders(), body: JSON.stringify({ enabled, reason }),
  });
  return handleResponse(res);
};

export const getAuditLog = async (guildId: string, limit = 20, type?: number) => {
  const params = new URLSearchParams({ guildId, limit: String(limit) });
  if (type !== undefined) params.set('type', String(type));
  const res = await fetch(`${API_URL}/api/bot/audit?${params}`, { headers: { 'x-api-key': API_KEY } });
  return handleResponse(res);
};

// ─── Público (sin auth) ───────────────────────────────────────────────────────

export const getPublicStatus = async () => {
  const res = await fetch(`${API_URL}/api/public/status`);
  return handleResponse(res);
};

export const getUptimeHistory = async () => {
  const res = await fetch(`${API_URL}/api/public/uptime`);
  return handleResponse(res);
};

export const getPublicIncidents = async () => {
  const res = await fetch(`${API_URL}/api/public/incidents`);
  return handleResponse(res);
};

// ─── Incidentes (authMiddleware) ──────────────────────────────────────────────

export const createIncident = async (title: string, impact: string, message?: string) => {
  const res = await fetch(`${API_URL}/api/incidents`, {
    method: 'POST', headers: getHeaders(), body: JSON.stringify({ title, impact, message }),
  });
  return handleResponse(res);
};

export const updateIncident = async (id: string, status: string, message: string) => {
  const res = await fetch(`${API_URL}/api/incidents/${id}`, {
    method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ status, message }),
  });
  return handleResponse(res);
};

export const deleteIncident = async (id: string) => {
  const res = await fetch(`${API_URL}/api/incidents/${id}`, {
    method: 'DELETE', headers: getHeaders(),
  });
  return handleResponse(res);
};

// ─── Premium ──────────────────────────────────────────────────────────────────

export const getPremiumStatus = async (discordId: string) => {
  const res = await fetch(`${API_URL}/api/premium/${discordId}`, { headers: { 'x-api-key': API_KEY } });
  return handleResponse(res);
};

export const activatePremium = async (discordId: string, plan: string, days: number) => {
  const res = await fetch(`${API_URL}/api/premium/activate`, {
    method: 'POST', headers: getHeaders(), body: JSON.stringify({ discordId, plan, days }),
  });
  return handleResponse(res);
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const deleteAuthUser = async (uid: string) => {
  const res = await fetch(`${API_URL}/api/users/${uid}`, {
    method: 'DELETE', headers: { 'x-api-key': API_KEY },
  });
  return handleResponse(res);
};