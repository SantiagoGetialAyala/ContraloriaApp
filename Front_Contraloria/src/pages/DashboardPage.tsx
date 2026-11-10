import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AppLink } from '../components/AppLink';
import { FormateadorTexto as format } from '../domain/Formatters';
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
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>({});
  const cargar = useCallback(async (filters: Record<string, string>) => {
    setLoading(true);
    try { setVm(await appServices.expedientes.obtenerDashboard(filters)); }
    catch (err) { onNotify('error', err instanceof Error ? err.message : 'No se pudo cargar el inicio.'); }
    finally { setLoading(false); }
  }, [onNotify]);
  useEffect(() => {
    let active = true;
    appServices.expedientes.obtenerDashboard({}).then((res) => { if (active) setVm(res); })
      .catch((err) => { if (active) onNotify('error', err instanceof Error ? err.message : 'No se pudo cargar el inicio.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [onNotify]);

  const handleFilter = (event: FormEvent) => {
    event.preventDefault();
    const filters = { q, from, until, state };
    setAppliedFilters(filters);
    void cargar(filters);
  };
  const clearFilters = () => {
    setQ(''); setFrom(''); setUntil(''); setState(''); setAppliedFilters({}); void cargar({});
  };
  if (!vm) return <section className="card padded" aria-busy={loading}>
    <h1>{loading ? 'Cargando inicio…' : 'No se pudo cargar el inicio'}</h1>
    {!loading && <button type="button" className="btn secondary" onClick={() => void cargar({})}>Reintentar</button>}
  </section>;

  const { dto, bandeja, recientes } = vm;
  const { stats, kinds, alerts, provisional, task_count, today } = dto;
  const filtered = Object.values(appliedFilters).some(Boolean);
  const financial = [
    ['Recuperado en recobros', stats.recovered], ['Saldo por recuperar', stats.pending],
    ['Viáticos comprometidos', stats.committed], ['Viáticos desembolsados', stats.payments],
    ['Gastos ejecutados', stats.executed],
  ];
  const indicators = [
    ['Incapacidades por revisar', stats.inc_review], ['Recobros pendientes', stats.inc_recoveries],
    ['Comisiones aprobadas con acto', stats.approved_trips], ['Comisiones rechazadas', stats.trip_rejected],
    ['Comisiones pendientes', stats.trip_commissions], ['Expedientes con pago', stats.trip_paid],
    ['Legalizaciones pendientes', stats.legalizations], ['Compensatorios pendientes', stats.comp_pending],
  ];
  return <>
    <header className="page-heading home-heading">
      <div><p className="muted home-date">{format.fechaCorta(today)}</p><h1>Inicio</h1><p>Sus pendientes y el estado de los trámites.</p></div>
      <details className="new-menu"><summary className="btn primary">＋ Nueva solicitud</summary><div className="dropdown">
        <AppLink to="/modulos/incapacidad/nuevo">Incapacidad o licencia</AppLink>
        <AppLink to="/modulos/viatico/nuevo">Comisión de servicio</AppLink>
        <AppLink to="/modulos/vacaciones/nuevo">Vacaciones</AppLink>
        <AppLink to="/modulos/compensatorio/nuevo">Registro de tiempo trabajado</AppLink>
      </div></details>
    </header>
    {provisional && <div className="notice compact"><span className="notice-icon" aria-hidden="true">i</span><div><strong>Hay procedimientos pendientes de validación</strong><p>Los expedientes con versión provisional no pueden cerrarse institucionalmente.</p></div><AppLink to="/procedimientos">Consultar procedimientos</AppLink></div>}

    <div className="stats-grid overview-stats" aria-busy={loading}>
      {[
        ['Expedientes', stats.total, `${stats.closed} finalizados · ${stats.rejected} rechazados`],
        ['En trámite', stats.active, `${stats.review} en revisión inicial`],
        ['A mi cargo', task_count, 'Requieren una actuación de su usuario'],
        ['Plazos vencidos', stats.overdue, stats.overdue ? 'Revise las alertas de seguimiento' : 'Sin vencimientos registrados'],
      ].map(([label, value, detail]) => <article className="stat" key={label}><span className="stat-top">{label}</span><strong>{value}</strong><p>{detail}</p></article>)}
    </div>

    <details className="view-filters"><summary>Filtrar vista general{filtered ? ' · Filtros aplicados' : ''}</summary>
      <form className="dashboard-filters" onSubmit={handleFilter}>
        <div className="field"><label htmlFor="dashboard-q">Funcionario o dependencia</label><input id="dashboard-q" name="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" /></div>
        <div className="field"><label htmlFor="dashboard-from">Registrado desde</label><input id="dashboard-from" name="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="field"><label htmlFor="dashboard-until">Hasta</label><input id="dashboard-until" name="until" type="date" min={from || undefined} value={until} onChange={(e) => setUntil(e.target.value)} /></div>
        <div className="field"><label htmlFor="dashboard-state">Estado</label><select id="dashboard-state" name="state" value={state} onChange={(e) => setState(e.target.value)}><option value="">Todos</option><option value="revision">En revisión inicial</option><option value="correccion">En corrección</option><option value="cerrado">Cerrado</option><option value="rechazado">Rechazado</option></select></div>
        <button className="btn secondary" type="submit" disabled={loading}>{loading ? 'Aplicando…' : 'Aplicar filtros'}</button>
        <button className="btn secondary" type="button" disabled={loading} onClick={clearFilters}>Limpiar</button>
      </form>
    </details>
    {filtered && <p className="help">Esta vista muestra únicamente los expedientes que coinciden con los filtros aplicados.</p>}

    <div className="dashboard-columns home-columns">
      <div className="dashboard-primary">
        <section className="card"><header className="card-heading"><div><h2>Pendientes a mi cargo <span className="count">{task_count}</span></h2><p>Abra un expediente para revisar los datos y continuar su trámite.</p></div></header>
          {bandeja.length ? <div className="table-wrap"><table><thead><tr><th>Expediente</th><th>Funcionario</th><th>Etapa actual</th><th><span className="sr-only">Acción</span></th></tr></thead><tbody>
            {bandeja.map((exp) => <tr key={exp.id}><td><AppLink className="ref" to={`/expedientes/${exp.id}`}>{exp.reference}</AppLink><small>{exp.kindDisplay}</small></td><td>{exp.ownerName}<small>{exp.department}</small></td><td><span className={exp.getBadgeEstadoClass()}>{exp.stageLabel}</span></td><td><AppLink className="text-link" to={`/expedientes/${exp.id}`} aria-label={`Revisar ${exp.reference}`}>Revisar</AppLink></td></tr>)}
          </tbody></table>{task_count > bandeja.length && <p className="help padded">Se muestran {bandeja.length} de {task_count} pendientes. Consulte cada módulo para ver el resto.</p>}</div> : <div className="empty"><span className="empty-icon" aria-hidden="true">✓</span><h3>Sin actuaciones pendientes</h3><p>Las solicitudes que requieran su intervención aparecerán aquí.</p>{usuario.esAdministrador() && <AppLink className="text-link" to="/administracion/usuarios">Gestionar usuarios y responsabilidades</AppLink>}</div>}
        </section>
        <section className="card"><header className="card-heading"><div><h2>Expedientes recientes</h2><p>Últimas actualizaciones disponibles para su usuario.</p></div></header>
          {recientes.length ? <div className="recent-list">{recientes.map((exp) => <AppLink key={exp.id} to={`/expedientes/${exp.id}`} className="recent-item"><span className="mini-icon" aria-hidden="true">{exp.getIcono()}</span><span><strong>{exp.reference}</strong><small>{exp.ownerName} · {exp.stageLabel}</small></span><time dateTime={exp.updatedAt}>{format.fechaHora(exp.updatedAt)}</time></AppLink>)}</div> : <div className="empty compact"><p>Aún no hay expedientes. Use «Nueva solicitud» para registrar el primero.</p></div>}
        </section>
      </div>
      <aside className="dashboard-secondary"><section className="card"><header className="card-heading"><div><h2>Alertas de seguimiento</h2><p>Vencimientos, correcciones y documentos pendientes.</p></div></header>
        {alerts.length ? <div className="alerts">{alerts.map((alert, index) => { const content = <><span className="dot amber-dot" aria-hidden="true" /><div><strong>{alert.label}</strong><small>{alert.reference}{alert.date && ` · ${format.fechaCorta(alert.date)}`}</small></div></>; return alert.case_id ? <AppLink key={index} className="alert-item" to={`/expedientes/${alert.case_id}`}>{content}</AppLink> : <div className="alert-item" key={index}>{content}</div>; })}</div> : <div className="empty compact"><p>Sin alertas registradas.</p><small>Los plazos dependen del procedimiento aprobado.</small></div>}
      </section></aside>
    </div>

    <details className="card report-disclosure"><summary><span><strong>Resumen e indicadores</strong><small>Expedientes por módulo y recursos registrados</small></span><span aria-hidden="true">＋</span></summary>
      <div className="report-grid"><section><h2>Expedientes por módulo</h2><dl className="report-values">{Object.entries(kinds).map(([kind, info]) => <div key={kind}><dt><AppLink to={`/modulos/${kind}`}>{info.name}</AppLink></dt><dd>{info.count} registrados · {info.closed} cerrados</dd></div>)}</dl></section>
      <section><h2>Recursos en seguimiento</h2><dl className="report-values">{financial.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{format.moneda(value)}</dd></div>)}</dl></section>
      <section><h2>Indicadores de gestión</h2><dl className="report-values">{indicators.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section></div><p className="help padded">Los valores corresponden a los expedientes visibles y al filtro aplicado.</p>
    </details>
  </>;
}
