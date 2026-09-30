// ─── Proyectos de `dev_projects`, compartidos por dos paneles ───────────────
// Proyectos (src/components/Proyectos.tsx) y Programación
// (src/components/PanelProgramacion.tsx) editan los MISMOS documentos, pero
// cada uno nació con sus propios nombres de campo:
//
//   Proyectos     repoUrl     tech    endDate    estado "archived"
//   Programación  repository  stack   deadline   estado "cancelled"
//
// Así el mismo proyecto mostraba otro stack y otra fecha en cada panel. Ahora
// los dos leen con `leerCamposComunes` (toma el que haya) y escriben con
// `escribirCamposComunes` (guarda ambos nombres), sin tener que migrar datos.

type Crudo = Record<string, unknown>;

const lista = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const texto = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Los campos que los dos paneles comparten, con los dos nombres ya resueltos. */
export function leerCamposComunes(r: Crudo) {
  const repo  = texto(r.repoUrl) || texto(r.repository);
  const tech  = lista(r.tech).length ? lista(r.tech) : lista(r.stack);
  const fecha = texto(r.endDate) || texto(r.deadline);
  return {
    repoUrl: repo, repository: repo,
    tech, stack: tech,
    endDate: fecha, deadline: fecha,
    version: texto(r.version),
  };
}

/** Agrega el nombre "del otro panel" a lo que se va a guardar. */
export function escribirCamposComunes<T extends Crudo>(payload: T): T & Crudo {
  const out: Crudo = { ...payload };
  if ('repoUrl' in payload)    out.repository = payload.repoUrl;
  if ('repository' in payload) out.repoUrl    = payload.repository;
  if ('tech' in payload)       out.stack      = payload.tech;
  if ('stack' in payload)      out.tech       = payload.stack;
  if ('endDate' in payload)    out.deadline   = payload.endDate;
  if ('deadline' in payload)   out.endDate    = payload.deadline;
  return out as T & Crudo;
}
