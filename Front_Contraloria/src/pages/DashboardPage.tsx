import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AppLink } from '../components/AppLink';
import { FormateadorTexto } from '../domain/Formatters';
import type { UsuarioSesion } from '../domain/Usuario';
import type { DashboardViewModel } from '../services/ExpedienteService';
import { appServices } from '../services/ServiceContainer';

interface DashboardPageProps {
  usuario: UsuarioSesion;
  onNotify: (type: 'success' | 'error' | 'warning', text: string) => void;
}

export function DashboardPage({ usuario, onNotify }: DashboardPageProps) {
  const [vm, setVm] = useState<DashboardViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [state, setState] = useState('');

  const cargar = useCallback(
    async (filtros: Record<string, string>) => {
      try {
        const res = await appServices.expedientes.obtenerDashboard(filtros);
        setVm(res);
      } catch (err) {
        onNotify('error', err instanceof Error ? err.message : 'Error cargando el panel.');
      } finally {
        setLoading(false);
      }
    },
    [onNotify],
  );

  useEffect(() => {
    let active = true;
    appServices.expedientes
      .obtenerDashboard({})
      .then((res) => {
        if (active) setVm(res);
      })
      .catch((err) => {
        if (active) {
          onNotify('error', err instanceof Error ? err.message : 'Error cargando el panel.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onNotify]);

  const handleFilterSubmit = (e: FormEvent) => {
    e.preventDefault();
    void cargar({ q, from, until, state });
  };

  const handleClear = () => {
    setQ('');
    setFrom('');
    setUntil('');
    setState('');
    void cargar({});
  };

  if (!vm && loading) {
    return (
      <section className="card padded">
        <p className="muted">Cargando panel de gestión…</p>
      </section>
    );
  }

  if (!vm) return null;

  const { dto, bandeja, recientes } = vm;
  const { stats, kinds, alerts, provisional, task_count, today } = dto;
  const hasFilters = Boolean(q || from || until || state);

  return (
    <>
      <div className="breadcrumb">
        Espacio de trabajo <span>/</span> Panel de gestión
      </div>
      <header className="page-heading">
        <div>
          <div className="eyebrow">VISTA GENERAL · {FormateadorTexto.fechaCorta(today)}</div>
          <h1>Todo en orden, paso a paso.</h1>
          <p>Consulte sus trámites, atienda pendientes y dé continuidad a cada proceso.</p>
        </div>
        <details className="new-menu">
          <summary className="btn primary">
            <span>＋</span> Nueva solicitud <span>⌄</span>
          </summary>
          <div className="dropdown">
            <AppLink to="/modulos/incapacidad/nuevo">✚ &nbsp; Incapacidad o licencia</AppLink>
            <AppLink to="/modulos/viatico/nuevo">↗ &nbsp; Comisión de servicio</AppLink>
            <AppLink to="/modulos/vacaciones/nuevo">☀ &nbsp; Solicitud de vacaciones</AppLink>
          </div>
        </details>
      </header>

      {provisional && (
        <div className="notice">
          <span className="notice-icon">i</span>
          <div>
            <strong>Configuración normativa pendiente</strong>
            <p>
              Los flujos son una propuesta de trabajo. La autoridad debe contrastarlos con las
              resoluciones y aprobar una versión antes del cierre institucional.
            </p>
          </div>
          <AppLink to="/procedimientos">Ver procedimientos ↗</AppLink>
        </div>
      )}

      <form className="dashboard-filters" onSubmit={handleFilterSubmit}>
        <div className="field">
          <label htmlFor="dashboard-q">Funcionario o dependencia</label>
          <input
            id="dashboard-q"
            name="q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filtrar la vista general…"
          />
        </div>
        <div className="field">
          <label htmlFor="dashboard-from">Registrado desde</label>
          <input
            id="dashboard-from"
            name="from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="dashboard-until">Hasta</label>
          <input
            id="dashboard-until"
            name="until"
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="dashboard-state">Estado</label>
          <select
            id="dashboard-state"
            name="state"
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="revision">En revisión</option>
            <option value="correccion">En corrección</option>
            <option value="cerrado">Cerrado</option>
            <option value="rechazado">Rechazado</option>
          </select>
        </div>
        <button className="btn secondary" type="submit">
          Aplicar
        </button>
        {hasFilters && (
          <button
            type="button"
            className="text-link"
            style={{ background: 'none', border: 'none' }}
            onClick={handleClear}
          >
            Limpiar
          </button>
        )}
      </form>

      <div className="stats-grid">
        <article className="stat">
          <div className="stat-top">
            <span>Expedientes registrados</span>
            <span className="stat-icon">▤</span>
          </div>
          <strong>{FormateadorTexto.dosDigitos(stats.total)}</strong>
          <p>
            <span className="dot green"></span> {stats.closed} finalizados
          </p>
        </article>
        <article className="stat">
          <div className="stat-top">
            <span>En trámite</span>
            <span className="stat-icon blue">↗</span>
          </div>
          <strong>{FormateadorTexto.dosDigitos(stats.active)}</strong>
          <p>{stats.review} pendientes de revisión</p>
        </article>
        <article className="stat">
          <div className="stat-top">
            <span>Mi bandeja de trabajo</span>
            <span className="stat-icon amber">◷</span>
          </div>
          <strong>{FormateadorTexto.dosDigitos(task_count)}</strong>
          <p>Actuaciones a su cargo</p>
        </article>
        <article className="stat">
          <div className="stat-top">
            <span>Plazos vencidos</span>
            <span className="stat-icon rose">⚑</span>
          </div>
          <strong>{FormateadorTexto.dosDigitos(stats.overdue)}</strong>
          <p>{stats.overdue ? 'Requieren seguimiento' : 'Sin vencimientos registrados'}</p>
        </article>
      </div>

      <div className="dashboard-columns">
        <div className="dashboard-primary">
          <section className="card">
            <header className="card-heading">
              <div>
                <h2>Módulos de gestión</h2>
                <p>Tres procedimientos, un expediente trazable.</p>
              </div>
              <span className="overline">TALENTO HUMANO</span>
            </header>
            <div className="module-grid">
              <AppLink className="module-card" to="/modulos/incapacidad">
                <div className="module-icon">✚</div>
                <h3>Incapacidades y recobro</h3>
                <p>Del reporte inicial a la recuperación de recursos y el cierre del expediente.</p>
                <div className="module-bottom">
                  <span>
                    {kinds.incapacidad.count} expedientes · {kinds.incapacidad.closed} cerrados
                  </span>
                  <span className="round-arrow">↗</span>
                </div>
              </AppLink>
              <AppLink className="module-card travel" to="/modulos/viatico">
                <div className="module-icon">↗</div>
                <h3>Viáticos y gastos de viaje</h3>
                <p>Autorización, presupuesto, pago y legalización de cada comisión.</p>
                <div className="module-bottom">
                  <span>
                    {kinds.viatico.count} expedientes · {kinds.viatico.closed} cerrados
                  </span>
                  <span className="round-arrow">↗</span>
                </div>
              </AppLink>
              <AppLink className="module-card" to="/modulos/vacaciones">
                <div className="module-icon">☀</div>
                <h3>Gestión de vacaciones</h3>
                <p>
                  Plan anual Ene–Dic, calendario mensual, días hábiles, cruces por dependencia y
                  saldos por periodo.
                </p>
                <div className="module-bottom">
                  <span>
                    {kinds.vacaciones.count} expedientes · {kinds.vacaciones.closed} cerrados
                  </span>
                  <span className="round-arrow">↗</span>
                </div>
              </AppLink>
            </div>
          </section>

          <section className="card">
            <header className="card-heading">
              <div>
                <h2>
                  Mi bandeja de trabajo <span className="count">{bandeja.length}</span>
                </h2>
                <p>Expedientes que esperan una actuación de su rol.</p>
              </div>
              <AppLink className="text-link" to="/procedimientos">
                Consultar responsabilidades ↗
              </AppLink>
            </header>
            {bandeja.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Expediente</th>
                      <th>Solicitante</th>
                      <th>Etapa actual</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bandeja.map((exp) => (
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
                          <span className={exp.getBadgeEstadoClass()}>{exp.stageLabel}</span>
                        </td>
                        <td>
                          <AppLink
                            className="row-link"
                            to={`/expedientes/${exp.id}`}
                            aria-label={`Abrir ${exp.reference}`}
                          >
                            →
                          </AppLink>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">
                <span className="empty-icon">✓</span>
                <h3>Su bandeja está al día</h3>
                <p>Las solicitudes que requieran su intervención aparecerán aquí.</p>
                {usuario.esAdministrador() && (
                  <AppLink className="text-link" to="/administracion/usuarios">
                    Configurar usuarios y responsabilidades →
                  </AppLink>
                )}
              </div>
            )}
          </section>

          <section className="card">
            <header className="card-heading">
              <div>
                <h2>Actividad de expedientes</h2>
                <p>Últimas actualizaciones a las que tiene acceso.</p>
              </div>
            </header>
            {recientes.length > 0 ? (
              <div className="recent-list">
                {recientes.map((exp) => (
                  <AppLink key={exp.id} to={`/expedientes/${exp.id}`} className="recent-item">
                    <span className="mini-icon">{exp.getIcono()}</span>
                    <span>
                      <strong>{exp.reference}</strong>
                      <small>
                        {exp.stageLabel} · {exp.ownerName}
                      </small>
                    </span>
                    <time>{FormateadorTexto.fechaHora(exp.updatedAt)}</time>
                    <span>↗</span>
                  </AppLink>
                ))}
              </div>
            ) : (
              <div className="empty compact">
                <p>Aún no hay expedientes registrados. Cree su primera solicitud para empezar.</p>
              </div>
            )}
          </section>
        </div>

        <aside className="dashboard-secondary">
          <section className="card financial-summary">
            <div className="overline">CONTROL FINANCIERO</div>
            <h2>Recursos en seguimiento</h2>
            <div className="finance-hero">
              <span>Recuperado en recobros</span>
              <strong>{FormateadorTexto.moneda(stats.recovered)}</strong>
            </div>
            <div className="finance-row">
              <span>Saldo por recuperar</span>
              <strong>{FormateadorTexto.moneda(stats.pending)}</strong>
            </div>
            <div className="finance-row">
              <span>Viáticos comprometidos</span>
              <strong>{FormateadorTexto.moneda(stats.committed)}</strong>
            </div>
            <div className="finance-row">
              <span>Viáticos desembolsados</span>
              <strong>{FormateadorTexto.moneda(stats.payments)}</strong>
            </div>
            <div className="finance-row">
              <span>Gastos ejecutados</span>
              <strong>{FormateadorTexto.moneda(stats.executed)}</strong>
            </div>
            <p className="help">Valores registrados en los expedientes visibles para su usuario.</p>
          </section>

          <section className="card indicator-card">
            <header className="card-heading">
              <div>
                <h2>Indicadores por módulo</h2>
                <p>Solicitudes y gestiones del período consultado.</p>
              </div>
            </header>
            <div className="padded">
              <div className="overline">INCAPACIDADES</div>
              <div className="finance-row">
                <span>Pendientes de revisión</span>
                <strong>{stats.inc_review}</strong>
              </div>
              <div className="finance-row">
                <span>Recobros con saldo pendiente</span>
                <strong>{stats.inc_recoveries}</strong>
              </div>
              <div className="finance-row">
                <span>Expedientes finalizados</span>
                <strong>{kinds.incapacidad.closed}</strong>
              </div>

              <div className="overline indicator-separator">VIÁTICOS</div>
              <div className="finance-row">
                <span>Solicitudes aprobadas con acto</span>
                <strong>{stats.approved_trips}</strong>
              </div>
              <div className="finance-row">
                <span>Solicitudes rechazadas</span>
                <strong>{stats.trip_rejected}</strong>
              </div>
              <div className="finance-row">
                <span>Comisiones pendientes</span>
                <strong>{stats.trip_commissions}</strong>
              </div>
              <div className="finance-row">
                <span>Expedientes con pago</span>
                <strong>{stats.trip_paid}</strong>
              </div>
              <div className="finance-row">
                <span>Legalizaciones pendientes</span>
                <strong>{stats.legalizations}</strong>
              </div>
            </div>
          </section>

          <section className="card">
            <header className="card-heading">
              <div>
                <h2>Seguimiento y alertas</h2>
                <p>Plazos, correcciones e hitos configurados.</p>
              </div>
            </header>
            {alerts.length > 0 ? (
              <div className="alerts">
                {alerts.map((a, idx) =>
                  a.case_id ? (
                    <AppLink
                      key={`${a.case_id}-${idx}`}
                      to={`/expedientes/${a.case_id}`}
                      className="alert-item"
                    >
                      <span className="dot amber-dot"></span>
                      <div>
                        <strong>{a.label}</strong>
                        <small>
                          {a.reference} · {FormateadorTexto.fechaCorta(a.date)}
                        </small>
                      </div>
                    </AppLink>
                  ) : (
                    <div key={`general-${idx}`} className="alert-item">
                      <span className="dot amber-dot"></span>
                      <div>
                        <strong>{a.label}</strong>
                        <small>{FormateadorTexto.fechaCorta(a.date)}</small>
                      </div>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <div className="empty compact">
                <span className="empty-icon small-icon">◷</span>
                <p>Sin alertas registradas.</p>
                <small>Los plazos se activan al aprobar los parámetros del procedimiento.</small>
              </div>
            )}
          </section>

          <div className="guidance-card">
            <span className="overline">CADA PASO CUENTA</span>
            <h3>La trazabilidad es parte del proceso.</h3>
            <p>
              Consulte quién interviene, qué documentos se necesitan y cómo continúa cada trámite.
            </p>
            <AppLink to="/procedimientos">
              Explorar procedimientos <span>→</span>
            </AppLink>
          </div>
        </aside>
      </div>
    </>
  );
}
