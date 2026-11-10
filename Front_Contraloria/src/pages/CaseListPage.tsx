import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AppLink } from '../components/AppLink';
import { FormateadorTexto } from '../domain/Formatters';
import type { CaseKind } from '../domain/types';
import type { CaseListViewModel } from '../services/ExpedienteService';
import { appServices } from '../services/ServiceContainer';

interface CaseListPageProps {
  kind: CaseKind;
  onNotify: (type: 'success' | 'error' | 'warning', text: string) => void;
}

const SUBTITLES: Record<CaseKind, string> = {
  incapacidad: 'Consulte el trámite administrativo y dé seguimiento a cada recobro.',
  viatico: 'Acompañe cada comisión desde la solicitud hasta su legalización.',
  compensatorio:
    'Registre tiempo trabajado y tramite solicitudes sin reconocer ni descontar saldos sin autorización.',
  vacaciones:
    'Programe vacaciones por días hábiles, con visto bueno del jefe, saldo por periodo y festivos descontados.',
};

export function CaseListPage({ kind, onNotify }: CaseListPageProps) {
  const [vm, setVm] = useState<CaseListViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [page, setPage] = useState(1);

  const cargar = useCallback(
    async (targetKind: CaseKind, filtros: Record<string, string>) => {
      try {
        const res = await appServices.expedientes.listarPorModulo(targetKind, filtros);
        setVm(res);
      } catch (err) {
        onNotify('error', err instanceof Error ? err.message : 'Error al consultar expedientes.');
      } finally {
        setLoading(false);
      }
    },
    [onNotify],
  );

  useEffect(() => {
    let active = true;
    appServices.expedientes
      .listarPorModulo(kind, {})
      .then((res) => {
        if (active) setVm(res);
      })
      .catch((err) => {
        if (active) {
          onNotify('error', err instanceof Error ? err.message : 'Error al consultar expedientes.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kind, onNotify]);

  const handleFilterSubmit = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    void cargar(kind, { q, state, from, until, page: '1' });
  };

  const handleClear = () => {
    setQ('');
    setState('');
    setFrom('');
    setUntil('');
    setPage(1);
    void cargar(kind, {});
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    void cargar(kind, { q, state, from, until, page: String(newPage) });
  };

  if (!vm && loading) {
    return (
      <section className="card padded">
        <p className="muted">Cargando expedientes…</p>
      </section>
    );
  }

  if (!vm) return null;

  const { dto, expedientes } = vm;
  const hasFilters = Boolean(q || state || from || until);

  return (
    <>
      <div className="breadcrumb">
        <AppLink to="/">Inicio</AppLink>
        <span>/</span>
        {dto.title}
      </div>
      <header className="page-heading">
        <div>
          <div className="eyebrow">EXPEDIENTES · {dto.count} REGISTROS</div>
          <h1>{dto.title}</h1>
          <p>{SUBTITLES[kind]}</p>
        </div>
        <AppLink className="btn primary" to={`/modulos/${kind}/nuevo`}>
          ＋ Nueva solicitud
        </AppLink>
      </header>

      {kind === 'compensatorio' && (
        <div className="notice">
          <span className="notice-icon">i</span>
          <div>
            <strong>Prototipo sujeto a validación institucional</strong>
            <p>
              Las equivalencias, límites y condiciones deben ser confirmadas por Talento Humano. El
              sistema bloquea movimientos de saldo mientras la versión sea provisional.
            </p>
          </div>
          <AppLink to="/compensatorios/calendario">Ver calendario ↗</AppLink>
        </div>
      )}

      <section className="card">
        <form className="filters" onSubmit={handleFilterSubmit}>
          <div className="field">
            <label htmlFor="search">Buscar funcionario o dependencia</label>
            <input
              id="search"
              type="search"
              name="q"
              placeholder="Nombre, usuario o dependencia…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="state">Estado</label>
            <select
              id="state"
              name="state"
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <option value="">Todos los estados</option>
              {dto.states.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="from">Registrado desde</label>
            <input
              id="from"
              type="date"
              name="from"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="until">Hasta</label>
            <input
              id="until"
              type="date"
              name="until"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
            />
          </div>
          <button className="btn secondary" type="submit">
            Filtrar
          </button>
          <button
            type="button"
            className="text-link"
            style={{ background: 'none', border: 'none' }}
            onClick={handleClear}
          >
            Limpiar
          </button>
        </form>

        <div className="table-toolbar">
          <span>
            {dto.count} expediente{dto.count === 1 ? '' : 's'} · acceso según sus permisos
          </span>
          <a className="text-link" href={dto.report_url}>
            ↓ Exportar CSV
          </a>
        </div>

        {expedientes.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Expediente / fecha</th>
                  <th>Solicitante</th>
                  <th>Periodo</th>
                  <th>Etapa y avance</th>
                  <th>Seguimiento</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {expedientes.map((exp) => {
                  const periodo = exp.getResumenPeriodo();
                  return (
                    <tr key={exp.id}>
                      <td>
                        <AppLink className="ref" to={`/expedientes/${exp.id}`}>
                          {exp.reference}
                        </AppLink>
                        <small>{FormateadorTexto.fechaCorta(exp.createdAt)}</small>
                      </td>
                      <td>
                        {exp.ownerName}
                        <small>{exp.department}</small>
                      </td>
                      <td>
                        {periodo.principal}
                        <small>{periodo.secundario}</small>
                      </td>
                      <td>
                        <span className={exp.getBadgeEstadoClass()}>{exp.stageLabel}</span>
                        <progress
                          className="mini-progress"
                          value={exp.progress}
                          max={100}
                          aria-label={`Avance: ${exp.progress} por ciento`}
                        ></progress>
                      </td>
                      <td>
                        {exp.overdue ? (
                          <span className="badge danger">Plazo vencido</span>
                        ) : exp.dueAt ? (
                          <small>Vence {FormateadorTexto.fechaCorta(exp.dueAt)}</small>
                        ) : (
                          <small>Sin plazo configurado</small>
                        )}
                      </td>
                      <td>
                        <AppLink
                          to={`/expedientes/${exp.id}`}
                          className="row-link"
                          aria-label={`Abrir ${exp.reference}`}
                        >
                          →
                        </AppLink>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty large-empty">
            <span className="empty-icon">▤</span>
            <h3>
              {hasFilters
                ? 'No hay resultados para estos filtros'
                : 'El primer expediente empieza aquí'}
            </h3>
            <p>Registre una solicitud y conserve toda su gestión en un solo lugar.</p>
            <AppLink className="btn primary" to={`/modulos/${kind}/nuevo`}>
              Crear solicitud →
            </AppLink>
          </div>
        )}

        <div className="pagination">
          <span>
            Página {page} de {dto.num_pages}
          </span>
          <div>
            {dto.has_previous && (
              <button
                type="button"
                className="btn secondary"
                onClick={() => handlePageChange(page - 1)}
              >
                ← Anterior
              </button>
            )}
            {dto.has_next && (
              <button
                type="button"
                className="btn secondary"
                onClick={() => handlePageChange(page + 1)}
              >
                Siguiente →
              </button>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
