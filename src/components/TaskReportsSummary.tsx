/**
 * TaskReportsSummary.tsx
 * Vista de resúmenes de reportes para CEO y Administración.
 * - Muestra todos los reportes agrupados por tarea
 * - Filtro por rol del reportante
 * - Preview de adjuntos (imágenes inline, otros como link)
 * - Badge de estado con color
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CheckCircle2, XCircle, Clock, FileImage, FileText,
  File, ChevronDown, ChevronUp, Users, RefreshCw
} from 'lucide-react';
import { getAllReports, getReportsByRole, type TaskReport, type ReportStatus } from '@/lib/taskReports';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<ReportStatus, { label: string; icon: React.ReactNode; color: string; bg: string; border: string }> = {
  completed: {
    label: 'Completado',
    icon:  <CheckCircle2 className="w-3.5 h-3.5" />,
    color: 'text-green-400', bg: 'bg-green-950/60', border: 'border-green-800',
  },
  'in-progress': {
    label: 'En Desarrollo',
    icon:  <Clock className="w-3.5 h-3.5" />,
    color: 'text-blue-400', bg: 'bg-blue-950/60', border: 'border-blue-800',
  },
  'not-completed': {
    label: 'No Completada',
    icon:  <XCircle className="w-3.5 h-3.5" />,
    color: 'text-red-400', bg: 'bg-red-950/60', border: 'border-red-800',
  },
};

const ROLE_FILTER_OPTIONS = [
  { value: 'all',           label: 'Todos'          },
  { value: 'Administración',label: 'Administración'  },
  { value: 'Empleado',      label: 'Empleados'       },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function AttachmentPreview({ att }: { att: { url: string; name: string; type: string } }) {
  if (att.type.startsWith('image/')) {
    return (
      <a href={att.url} target="_blank" rel="noreferrer" className="block">
        <img
          src={att.url}
          alt={att.name}
          className="w-full max-h-40 object-cover rounded-md border border-zinc-800 hover:opacity-90 transition-opacity"
        />
      </a>
    );
  }
  const Icon = att.type === 'application/pdf' ? FileText : File;
  return (
    <a href={att.url} target="_blank" rel="noreferrer"
      className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-md hover:border-zinc-700 transition-colors">
      <Icon className="w-4 h-4 text-zinc-400 flex-shrink-0" />
      <span className="text-zinc-400 text-xs font-extralight truncate">{att.name}</span>
    </a>
  );
}

// ── Componente de reporte individual ─────────────────────────────────────────

function ReportCard({ report }: { report: TaskReport }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CFG[report.reportStatus];

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      {/* Header del reporte */}
      <button
        type="button"
        onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900/50 hover:bg-zinc-900/80 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar */}
          <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-extralight">
              {report.reporterName?.[0]?.toUpperCase() ?? '?'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-extralight truncate">{report.reporterName}</p>
            <p className="text-zinc-600 text-xs font-extralight">{report.reporterRole}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
          {/* Badge de estado */}
          <span className={`flex items-center gap-1.5 text-xs font-extralight px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
            {cfg.icon}{cfg.label}
          </span>
          <span className="text-zinc-600 text-xs font-extralight hidden sm:block">
            {format(new Date(report.updatedAt), "d MMM, HH:mm", { locale: es })}
          </span>
          {expanded
            ? <ChevronUp   className="w-4 h-4 text-zinc-500" />
            : <ChevronDown className="w-4 h-4 text-zinc-500" />
          }
        </div>
      </button>

      {/* Detalle expandido */}
      {expanded && (
        <div className="px-4 pb-4 pt-3 space-y-4 bg-zinc-950">
          {/* Razón (solo si No Completada) */}
          {report.reportStatus === 'not-completed' && report.reason && (
            <div className="space-y-1">
              <p className="text-zinc-500 text-xs font-extralight uppercase tracking-wider">Razón</p>
              <div className="p-3 bg-red-950/20 border border-red-900/40 rounded-md">
                <p className="text-red-300 text-sm font-extralight leading-relaxed">{report.reason}</p>
              </div>
            </div>
          )}

          {/* Comentario */}
          {report.comment && (
            <div className="space-y-1">
              <p className="text-zinc-500 text-xs font-extralight uppercase tracking-wider">Comentario</p>
              <p className="text-zinc-300 text-sm font-extralight leading-relaxed bg-zinc-900/50 rounded-md p-3 border border-zinc-800">
                {report.comment}
              </p>
            </div>
          )}

          {/* Adjuntos */}
          {report.attachments.length > 0 && (
            <div className="space-y-2">
              <p className="text-zinc-500 text-xs font-extralight uppercase tracking-wider flex items-center gap-1.5">
                <FileImage className="w-3 h-3" /> Adjuntos ({report.attachments.length})
              </p>
              {/* Imágenes en grid */}
              {report.attachments.filter(a => a.type.startsWith('image/')).length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {report.attachments.filter(a => a.type.startsWith('image/')).map((att, i) => (
                    <AttachmentPreview key={i} att={att} />
                  ))}
                </div>
              )}
              {/* Otros archivos en lista */}
              {report.attachments.filter(a => !a.type.startsWith('image/')).map((att, i) => (
                <AttachmentPreview key={i} att={att} />
              ))}
            </div>
          )}

          {!report.comment && !report.reason && report.attachments.length === 0 && (
            <p className="text-zinc-700 text-xs font-extralight text-center py-2">Sin detalles adicionales.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

const TaskReportsSummary: React.FC = () => {
  const { userProfile } = useAuth();
  const isCEO           = userProfile?.role === 'CEO';

  const [reports,     setReports]     = useState<TaskReport[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [roleFilter,  setRoleFilter]  = useState('all');
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  const fetchReports = async () => {
    setLoading(true);
    try {
      // CEO ve todos; Administración solo ve los de Empleados
      const data = isCEO
        ? await getAllReports()
        : await getReportsByRole('Empleado');
      setReports(data);
    } catch (e) {
      console.error('Error fetching reports:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, []);

  // Agrupar por tarea
  const filtered = roleFilter === 'all'
    ? reports
    : reports.filter(r => r.reporterRole === roleFilter);

  const grouped = filtered.reduce<Record<string, TaskReport[]>>((acc, r) => {
    if (!acc[r.taskId]) acc[r.taskId] = [];
    acc[r.taskId].push(r);
    return acc;
  }, {});

  const toggleTask = (taskId: string) =>
    setExpandedTasks(prev => {
      const n = new Set(prev);
      n.has(taskId) ? n.delete(taskId) : n.add(taskId);
      return n;
    });

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="text-zinc-500 font-extralight tracking-widest text-sm">Cargando reportes...</div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-extralight text-white flex items-center gap-3">
          <Users className="w-6 h-6" strokeWidth={1.5} />
          Reportes de Tareas
        </h2>
        <div className="flex items-center gap-3">
          {/* Filtro por rol (solo CEO) */}
          {isCEO && (
            <div className="inline-flex bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 gap-0.5">
              {ROLE_FILTER_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRoleFilter(opt.value)}
                  className={`px-3 py-1.5 rounded-md text-xs font-extralight transition-all duration-150
                    ${roleFilter === opt.value ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          <button onClick={fetchReports}
            className="text-zinc-500 hover:text-white transition-colors p-1.5 rounded-md hover:bg-zinc-800">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Contador */}
      <p className="text-zinc-600 text-xs font-extralight">
        {Object.keys(grouped).length} tarea(s) con reportes · {filtered.length} reporte(s) en total
      </p>

      {/* Sin reportes */}
      {Object.keys(grouped).length === 0 && (
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="py-12 text-center">
            <Users className="w-10 h-10 text-zinc-700 mx-auto mb-3" strokeWidth={1} />
            <p className="text-zinc-500 font-extralight">No hay reportes {roleFilter !== 'all' ? `de ${roleFilter}` : ''} aún.</p>
          </CardContent>
        </Card>
      )}

      {/* Tareas agrupadas */}
      {Object.entries(grouped).map(([taskId, taskReports]) => {
        const taskTitle  = taskReports[0].taskTitle;
        const isExpanded = expandedTasks.has(taskId);

        // Estadísticas de la tarea
        const counts = {
          completed:     taskReports.filter(r => r.reportStatus === 'completed').length,
          'in-progress': taskReports.filter(r => r.reportStatus === 'in-progress').length,
          'not-completed': taskReports.filter(r => r.reportStatus === 'not-completed').length,
        };

        return (
          <Card key={taskId} className="bg-zinc-950 border-zinc-800">
            {/* Header de la tarea */}
            <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleTask(taskId)}>
              <CardTitle className="text-white font-extralight flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="truncate text-base">{taskTitle}</span>
                  <span className="text-zinc-600 text-sm font-extralight flex-shrink-0">
                    {taskReports.length} reporte(s)
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  {/* Mini badges de conteo */}
                  {counts.completed > 0 && (
                    <span className="flex items-center gap-1 text-xs font-extralight px-2 py-0.5 rounded-full bg-green-950/60 text-green-400 border border-green-800">
                      <CheckCircle2 className="w-3 h-3" />{counts.completed}
                    </span>
                  )}
                  {counts['in-progress'] > 0 && (
                    <span className="flex items-center gap-1 text-xs font-extralight px-2 py-0.5 rounded-full bg-blue-950/60 text-blue-400 border border-blue-800">
                      <Clock className="w-3 h-3" />{counts['in-progress']}
                    </span>
                  )}
                  {counts['not-completed'] > 0 && (
                    <span className="flex items-center gap-1 text-xs font-extralight px-2 py-0.5 rounded-full bg-red-950/60 text-red-400 border border-red-800">
                      <XCircle className="w-3 h-3" />{counts['not-completed']}
                    </span>
                  )}
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                </div>
              </CardTitle>
            </CardHeader>

            {/* Reportes de la tarea */}
            {isExpanded && (
              <CardContent className="space-y-2 pt-0">
                {taskReports.map(rep => (
                  <ReportCard key={rep.id} report={rep} />
                ))}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
};

export default TaskReportsSummary;