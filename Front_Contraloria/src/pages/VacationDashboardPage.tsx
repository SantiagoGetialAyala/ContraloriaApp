import { LoadError } from '../components/LoadError';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AppLink } from '../components/AppLink';
import { FormateadorTexto } from '../domain/Formatters';
import {
  AnalizadorCrucesVacaciones,
  CalendarioLaboralColombia,
  ProgramacionVacacionItem,
  type ReglaCruceVacaciones,
} from '../domain/PlanVacaciones';
import type { UsuarioSesion } from '../domain/Usuario';
import type { VacationDashboardDTO } from '../domain/types';
import type { CaseListViewModel } from '../services/ExpedienteService';
import { ApiError } from '../services/HttpClient';
import { appServices } from '../services/ServiceContainer';

interface VacationDashboardPageProps {
  usuario: UsuarioSesion;
  initialTab?: 'calendar' | 'annual' | 'cases' | 'balances';
  onNotify: (type: 'success' | 'error' | 'warning', text: string) => void;
}

export function VacationDashboardPage({
  usuario,
  initialTab = 'cases',
  onNotify,
}: VacationDashboardPageProps) {
  const [dashData, setDashData] = useState<VacationDashboardDTO | null>(null);
  const [casesVm, setCasesVm] = useState<CaseListViewModel | null>(null);
  const [loading, setLoading] = useState(true);

  // Modo de visualización principal
  const [mode, setModeState] = useState<'calendar' | 'annual' | 'cases' | 'balances'>(() => {
    const view = new URLSearchParams(window.location.search).get('vista');
    return view === 'calendar' || view === 'annual' || view === 'cases' || view === 'balances' ? view : initialTab;
  });
  const setMode = (value: 'calendar' | 'annual' | 'cases' | 'balances') => {
    setModeState(value);
    const url = new URL(window.location.href);
    url.searchParams.set('vista', value);
    window.history.replaceState({}, '', url.pathname + url.search);
  };
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth());
  const [currentDept, setCurrentDept] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [rule, setRule] = useState<ReglaCruceVacaciones>('DEPT');
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);

  // Modal de simulación / programación
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [simWorkerId, setSimWorkerId] = useState(() => String(usuario.id));
  const modalRef = useRef<HTMLDialogElement>(null);
  const [simStart, setSimStart] = useState(() => CalendarioLaboralColombia.toISO(new Date()));
  const [simDays, setSimDays] = useState<number>(15);
  const [simObservations, setSimObservations] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);

  // Filtros de pestaña de expedientes
  const [caseQ, setCaseQ] = useState('');
  const [caseState, setCaseState] = useState('');
  const [caseFrom, setCaseFrom] = useState('');
  const [caseUntil, setCaseUntil] = useState('');
  const [casePage, setCasePage] = useState(1);

  // Formularios de Saldos Iniciales y Festivos (Secciones 6.3 y 6.4)
  const [initEmpId, setInitEmpId] = useState<string>('');
  const [initPeriodNum, setInitPeriodNum] = useState<number>(1);
  const [initDays, setInitDays] = useState<number>(5);
  const [initNote, setInitNote] = useState<string>('');
  const [holidayDate, setHolidayDate] = useState<string>('');
  const [holidayName, setHolidayName] = useState<string>('');

  const cargarTodo = useCallback(
    async (targetYear: number, filtrosCasos: Record<string, string> = {}) => {
      try {
        const [dRes, cRes] = await Promise.all([
          appServices.expedientes.obtenerDashboardVacaciones(targetYear),
          appServices.expedientes.listarPorModulo('vacaciones', filtrosCasos),
        ]);
        setDashData(dRes);
        setCasesVm(cRes);
        if (dRes.employees.length > 0) {
          setInitEmpId((prev) => prev || String(dRes.employees[0].id));
        }
      } catch (err) {
        onNotify(
          'error',
          err instanceof Error ? err.message : 'Error cargando gestión de vacaciones.',
        );
      } finally {
        setLoading(false);
      }
    },
    [onNotify],
  );

  useEffect(() => {
    let active = true;
    Promise.all([
      appServices.expedientes.obtenerDashboardVacaciones(year),
      appServices.expedientes.listarPorModulo('vacaciones', {}),
    ])
      .then(([dRes, cRes]) => {
        if (!active) return;
        setDashData(dRes);
        setCasesVm(cRes);
        if (dRes.employees.length > 0) {
          setInitEmpId(String(dRes.employees[0].id));
        }
      })
      .catch((err) => {
        if (active) {
          onNotify(
            'error',
            err instanceof Error ? err.message : 'Error cargando gestión de vacaciones.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [year, onNotify]);

  const calendario = useMemo(
    () => new CalendarioLaboralColombia(dashData?.holidays || []),
    [dashData?.holidays],
  );

  const todosLosRegistros = useMemo<ProgramacionVacacionItem[]>(() => {
    return (dashData?.schedule || []).map((dto) => new ProgramacionVacacionItem(dto));
  }, [dashData?.schedule]);

  const departamentosDisponibles = useMemo<string[]>(() => {
    const set = new Set<string>(dashData?.dependencias || []);
    for (const item of todosLosRegistros) {
      if (item.dept) set.add(item.dept);
    }
    return Array.from(set).sort();
  }, [dashData?.dependencias, todosLosRegistros]);

  const trabajadoresFiltrados = useMemo<ProgramacionVacacionItem[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    return todosLosRegistros.filter((w) => {
      const matchDept = currentDept === 'ALL' || w.dept === currentDept;
      const startM =
        CalendarioLaboralColombia.NOMBRES_MESES[w.getMesInicio()]?.toLowerCase() || '';
      const endM = CalendarioLaboralColombia.NOMBRES_MESES[w.getMesFin()]?.toLowerCase() || '';
      const matchQ =
        !q ||
        w.name.toLowerCase().includes(q) ||
        w.dept.toLowerCase().includes(q) ||
        w.role.toLowerCase().includes(q) ||
        startM.includes(q) ||
        endM.includes(q);
      return matchDept && matchQ;
    });
  }, [todosLosRegistros, currentDept, searchQuery]);

  const trabajadorSeleccionado = useMemo<ProgramacionVacacionItem | null>(
    () => todosLosRegistros.find((w) => w.id === selectedWorkerId) || null,
    [todosLosRegistros, selectedWorkerId],
  );

  const totalCrucesAnuales = useMemo(
    () => AnalizadorCrucesVacaciones.contarParesEnConflicto(todosLosRegistros, rule),
    [todosLosRegistros, rule],
  );

  const seleccionarTrabajador = (id: string | null) => {
    if (!id || selectedWorkerId === id) {
      setSelectedWorkerId(null);
      return;
    }
    setSelectedWorkerId(id);
    const found = todosLosRegistros.find((w) => w.id === id);
    if (found && found.tieneFechas()) {
      setCurrentMonth(found.getMesInicio());
    }
  };

  const cambiarMes = (monthIdx: number) => {
    setCurrentMonth(monthIdx);
    if (mode !== 'calendar') {
      setMode('calendar');
    }
  };

  const avanzarMes = (delta: number) => {
    const target = new Date(year, currentMonth + delta, 1);
    if (target.getFullYear() < 2020 || target.getFullYear() > 2035) return;
    setYear(target.getFullYear());
    setCurrentMonth(target.getMonth());
  };

  useEffect(() => {
    if (modalOpen) modalRef.current?.showModal();
  }, [modalOpen]);

  const abrirSimulador = () => {
    setSimWorkerId(String(usuario.id));
    setModalOpen(true);
  };

  const workerSimulado = useMemo(() => {
    const worker = dashData?.employees.find((employee) => String(employee.id) === simWorkerId);
    return {
      employeeId: worker?.id ?? usuario.id,
      dept: worker?.dept ?? usuario.dependencia,
      name: worker?.name ?? usuario.nombreCompleto,
    };
  }, [dashData?.employees, simWorkerId, usuario]);
  const ownSimulation = workerSimulado.employeeId === usuario.id;

  const resultadoSimulacion = useMemo(() => {
    return AnalizadorCrucesVacaciones.simularProgramacion(
      workerSimulado.employeeId,
      workerSimulado.dept,
      simStart,
      simDays,
      todosLosRegistros,
      calendario,
    );
  }, [workerSimulado, simStart, simDays, todosLosRegistros, calendario]);

  const handleRadicarDesdeSimulador = async (e: FormEvent) => {
    e.preventDefault();
    if (!ownSimulation) return;
    setBusy(true);
    try {
      const { expediente, mensaje } = await appServices.expedientes.crearBorrador('vacaciones', {
        start_date: simStart,
        business_days: simDays,
        observations:
          simObservations ||
          `Solicitud programada desde el Plan Anual (${simDays} días hábiles, del ${simStart} al ${resultadoSimulacion.endIso}).`,
      });
      setModalOpen(false);
      onNotify('success', mensaje);
      appServices.navigation.navigate(`/expedientes/${expediente.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        err.errors.forEach((m) => onNotify('error', m));
      } else {
        onNotify('error', 'No fue posible radicar la solicitud de vacaciones.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCaseFilterSubmit = (e: FormEvent) => {
    e.preventDefault();
    setCasePage(1);
    void cargarTodo(year, {
      q: caseQ,
      state: caseState,
      from: caseFrom,
      until: caseUntil,
      page: '1',
    });
  };

  const handleInitialBalanceSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const msg = await appServices.expedientes.registrarSaldoInicialVacaciones({
        employee_id: Number(initEmpId),
        period_number: initPeriodNum,
        days: initDays,
        note: initNote,
      });
      setInitNote('');
      onNotify('success', msg);
      await cargarTodo(year);
    } catch (err) {
      if (err instanceof ApiError) {
        err.errors.forEach((m) => onNotify('error', m));
      } else {
        onNotify('error', 'No fue posible registrar el saldo inicial.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSaveHolidaySubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const msg = await appServices.expedientes.guardarFestivoVacaciones({
        date: holidayDate,
        name: holidayName,
      });
      setHolidayDate('');
      setHolidayName('');
      onNotify('success', msg);
      await cargarTodo(year);
    } catch (err) {
      if (err instanceof ApiError) {
        err.errors.forEach((m) => onNotify('error', m));
      } else {
        onNotify('error', 'No fue posible guardar el festivo.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!dashData && loading) {
    return (
      <section className="card padded">
        <p className="muted">Cargando gestión y plan anual de vacaciones…</p>
      </section>
    );
  }

  if (!dashData) return <LoadError />;

  const celdasMes = calendario.construirCeldasMes(year, currentMonth);
  const festivosDelAnio = calendario.listarFestivosPorAnio(year);

  return (
    <>
      <div className="breadcrumb">
        <AppLink to="/">Inicio</AppLink>
        <span>/</span>
        Gestión de vacaciones
      </div>

      <header className="page-heading">
        <div>
          <h1>Gestión de vacaciones</h1>
          <p>
            Consulte solicitudes, calendario y saldos de vacaciones.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn secondary" onClick={abrirSimulador}>
            ◷ Simular fechas y cruces
          </button>
          <AppLink className="btn primary" to="/modulos/vacaciones/nuevo">
            ＋ Nueva solicitud de vacaciones
          </AppLink>
        </div>
      </header>

      {/* Tarjetas de resumen institucional */}
      {todosLosRegistros.length > 0 && <div className="stats-grid overview-stats">
        <article className="stat">
          <div className="stat-top">
            <span>Programaciones en vista ({year})</span>
            <span className="stat-icon">☀</span>
          </div>
          <strong>{FormateadorTexto.dosDigitos(todosLosRegistros.length)}</strong>
          <p>
            <span className="dot green"></span>{' '}
            Expedientes registrados
          </p>
        </article>
        <article className="stat">
          <div className="stat-top">
            <span>Concedidas / En disfrute</span>
            <span className="stat-icon blue">✓</span>
          </div>
          <strong>
            {FormateadorTexto.dosDigitos(
              todosLosRegistros.filter((w) => w.status === 'concedida').length,
            )}
          </strong>
          <p>Con resolución o disfrute activo</p>
        </article>
        <article className="stat">
          <div className="stat-top">
            <span>En trámite de aprobación</span>
            <span className="stat-icon amber">◷</span>
          </div>
          <strong>
            {FormateadorTexto.dosDigitos(
              todosLosRegistros.filter((w) => w.status === 'en_tramite').length,
            )}
          </strong>
          <p>Visto bueno, revisión o acto</p>
        </article>
        <article className="stat">
          <div className="stat-top">
            <span>Cruces detectados ({rule === 'DEPT' ? 'Área' : 'Global'})</span>
            <span className="stat-icon rose">⚑</span>
          </div>
          <strong>{FormateadorTexto.dosDigitos(totalCrucesAnuales)}</strong>
          <p>
            {totalCrucesAnuales > 0
              ? 'Coincidencias de fechas activas'
              : `Mi saldo disponible: ${dashData.stats.own_balance} días`}
          </p>
        </article>
      </div>}

      {todosLosRegistros.length === 0 && (mode === 'calendar' || mode === 'annual') && <div className="notice compact"><div><strong>Sin vacaciones registradas en {year}</strong><p>El calendario se completará con sus solicitudes. Puede crear un borrador o simular fechas.</p></div></div>}

      {/* Ventana Principal Unificada estilo Apple Calendar con Colorimetría Contraloría */}
      <div className="vac-window">
        {/* Barra Superior Unificada */}
        <header className="vac-toolbar">
          <div className="vac-brand-head">
            <span className="vac-brand-dot"></span>
            <div>
              <h2>Plan Anual de Vacaciones · {year}</h2>
              <p>Contraloría Municipal de Pasto · Talento Humano</p>
            </div>
          </div>

          {/* Segmented Control */}
          <div className="vac-segmented" role="group" aria-label="Vistas de gestión de vacaciones">
            <button
              type="button"
              className={`vac-seg-btn ${mode === 'calendar' ? 'active' : ''}`}
              aria-pressed={mode === 'calendar'}
              onClick={() => setMode('calendar')}
            >
              Mes
            </button>
            <button
              type="button"
              className={`vac-seg-btn ${mode === 'annual' ? 'active' : ''}`}
              aria-pressed={mode === 'annual'}
              onClick={() => setMode('annual')}
            >
              Año
            </button>
            <button
              type="button"
              className={`vac-seg-btn ${mode === 'cases' ? 'active' : ''}`}
              aria-pressed={mode === 'cases'}
              onClick={() => setMode('cases')}
            >
              Expedientes ({casesVm?.dto.count ?? 0})
            </button>
            <button
              type="button"
              className={`vac-seg-btn ${mode === 'balances' ? 'active' : ''}`}
              aria-pressed={mode === 'balances'}
              onClick={() => setMode('balances')}
            >
              Saldos y festivos
            </button>
          </div>

          {/* Controles derechos */}
          <div className="vac-toolbar-actions">
            {mode !== 'cases' && <select
              aria-label="Año del plan"
              className="vac-select-compact"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              <option value={2025}>Año 2025</option>
              <option value={2026}>Año 2026</option>
              <option value={2027}>Año 2027</option>
            </select>}

            {(mode === 'calendar' || mode === 'annual') && <select
              aria-label="Regla de validación de cruces"
              className="vac-select-compact"
              value={rule}
              onChange={(e) => setRule(e.target.value as ReglaCruceVacaciones)}
            >
              <option value="DEPT">Cruce por dependencia</option>
              <option value="GLOBAL">Cruce global (todos)</option>
            </select>}

          </div>
        </header>

        {/* MODO 1 Y 2: SPLIT-VIEW (CALENDARIO MENSUAL Y PANORAMA ANUAL ENE-DIC) */}
        {(mode === 'calendar' || mode === 'annual') && (
          <div className="vac-split">
            {/* Sidebar Izquierdo */}
            <aside className="vac-sidebar">
              <div>
                <input
                  type="search"
                  className="vac-search"
                  aria-label="Buscar funcionario, dependencia o mes"
                  placeholder="Buscar funcionario, dependencia o mes…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />

                {/* Píldoras de dependencia */}
                <div className="vac-dept-pills">
                  <button
                    type="button"
                    className={`vac-dept-pill ${currentDept === 'ALL' ? 'active' : ''}`}
                    onClick={() => setCurrentDept('ALL')}
                  >
                    Todas
                  </button>
                  {departamentosDisponibles.map((dept) => (
                    <button
                      key={dept}
                      type="button"
                      className={`vac-dept-pill ${currentDept === dept ? 'active' : ''}`}
                      onClick={() => setCurrentDept(dept)}
                    >
                      {dept === 'Responsabilidad Fiscal' ? 'Resp. Fiscal' : dept}
                    </button>
                  ))}
                </div>

                <div className="vac-sidebar-header">
                  <span>Funcionarios (clic para ir a su mes)</span>
                  {trabajadorSeleccionado && (
                    <button
                      type="button"
                      className="text-link"
                      style={{ background: 'none', border: 'none', padding: 0 }}
                      onClick={() => seleccionarTrabajador(null)}
                    >
                      Ver todos
                    </button>
                  )}
                </div>

                {/* Lista de funcionarios */}
                <div className="vac-worker-list">
                  {trabajadoresFiltrados.length > 0 ? (
                    trabajadoresFiltrados.map((w) => {
                      const isSelected = w.id === selectedWorkerId;
                      const conflicts = AnalizadorCrucesVacaciones.obtenerConflictosDe(
                        w,
                        todosLosRegistros,
                        rule,
                      );
                      const hasConflict = conflicts.length > 0;

                      let itemClass = 'vac-worker-item';
                      let dotClass = hasConflict
                        ? 'vac-status-dot conflict'
                        : w.status === 'en_tramite'
                          ? 'vac-status-dot warning'
                          : 'vac-status-dot';
                      let subtitle = `${w.getRangoCorto()} · ${w.getEtiquetaEstado()}`;

                      if (trabajadorSeleccionado) {
                        if (isSelected) {
                          itemClass = 'vac-worker-item selected';
                          dotClass = 'vac-status-dot selected-ring';
                        } else {
                          const ov = AnalizadorCrucesVacaciones.calcularTraslape(
                            trabajadorSeleccionado.start,
                            trabajadorSeleccionado.end,
                            w.start,
                            w.end,
                          );
                          if (ov) {
                            const sameArea = w.dept === trabajadorSeleccionado.dept;
                            itemClass = sameArea
                              ? 'vac-worker-item conflict-same'
                              : 'vac-worker-item conflict-other';
                            dotClass = sameArea
                              ? 'vac-status-dot conflict'
                              : 'vac-status-dot warning';
                            subtitle = `Cruce: ${ov.days}d (${CalendarioLaboralColombia.formatearCorto(ov.start)} – ${CalendarioLaboralColombia.formatearCorto(ov.end)})`;
                          } else {
                            itemClass = 'vac-worker-item dimmed';
                          }
                        }
                      }

                      return (
                        <div
                          key={w.id}
                          className={itemClass}
                          onClick={() => seleccionarTrabajador(w.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              seleccionarTrabajador(w.id);
                            }
                          }}
                        >
                          <div className="vac-worker-info">
                            <span className={dotClass}></span>
                            <div className="vac-worker-text">
                              <div className="vac-worker-name">{w.name}</div>
                              <div className="vac-worker-sub">
                                {w.dept} · {subtitle}
                              </div>
                            </div>
                          </div>
                          {w.caseId && (
                            <AppLink
                              className="text-link"
                              to={`/expedientes/${w.caseId}`}
                              onClick={(e) => e.stopPropagation()}
                              title={`Abrir expediente ${w.reference}`}
                            >
                              ↗
                            </AppLink>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="empty compact">
                      <p>No hay funcionarios para este filtro.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Leyenda accesible con color + texto */}
              <div className="vac-legend">
                <span className="vac-legend-item">
                  <span className="vac-status-dot"></span> Concedida
                </span>
                <span className="vac-legend-item">
                  <span className="vac-status-dot conflict"></span> En cruce
                </span>
                <span className="vac-legend-item">
                  <span className="vac-status-dot warning"></span> Trámite / Otra área
                </span>
              </div>
            </aside>

            {/* Lienzo Principal Derecho */}
            <div className="vac-canvas">
              <div>
                {/* Barra de los 12 Meses del Año */}
                <div className="vac-months-bar">
                  {CalendarioLaboralColombia.MESES_CORTOS.map((label, idx) => {
                    const workersInMonth = trabajadoresFiltrados.filter((w) =>
                      w.tocaMes(year, idx),
                    );
                    const mStart = CalendarioLaboralColombia.toISO(new Date(year, idx, 1));
                    const mEnd = CalendarioLaboralColombia.toISO(new Date(year, idx + 1, 0));
                    const hasConflictInMonth = workersInMonth.some((w) => {
                      const c = AnalizadorCrucesVacaciones.obtenerConflictosDe(
                        w,
                        todosLosRegistros,
                        rule,
                      );
                      return c.some(
                        (conf) => conf.overlap.start <= mEnd && conf.overlap.end >= mStart,
                      );
                    });

                    const isSelectedMonth = mode === 'calendar' && currentMonth === idx;
                    const selectedTouches =
                      trabajadorSeleccionado && trabajadorSeleccionado.tocaMes(year, idx);

                    let btnClass = 'vac-month-btn';
                    if (isSelectedMonth) btnClass += ' active';
                    else if (selectedTouches) btnClass += ' touched';

                    let indClass = 'vac-month-indicator';
                    if (hasConflictInMonth) indClass += ' conflict';
                    else if (workersInMonth.length > 0) indClass += ' normal';

                    return (
                      <button
                        key={label}
                        type="button"
                        className={btnClass}
                        onClick={() => cambiarMes(idx)}
                      >
                        <span>{label}</span>
                        <span className={indClass}></span>
                      </button>
                    );
                  })}
                </div>

                {/* Sub-encabezado contextual */}
                <div className="vac-subhead">
                  <div className="vac-subhead-left">
                    {mode === 'calendar' && (
                      <div className="vac-nav-arrows">
                        <button
                          type="button"
                          className="vac-arrow-btn"
                          onClick={() => avanzarMes(-1)}
                          title="Mes anterior"
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          className="vac-arrow-btn"
                          onClick={() => avanzarMes(1)}
                          title="Mes siguiente"
                        >
                          ›
                        </button>
                      </div>
                    )}
                    <h3>
                      {mode === 'annual'
                        ? `Panorama Anual · Enero a Diciembre ${year}`
                        : `${CalendarioLaboralColombia.NOMBRES_MESES[currentMonth]} ${year}`}
                    </h3>
                  </div>

                  {/* Píldora de estado contextual */}
                  <div className="vac-context-pill">
                    {!trabajadorSeleccionado ? (
                      totalCrucesAnuales > 0 ? (
                        <>
                          <strong className="conflict">
                            ● {totalCrucesAnuales}{' '}
                            {totalCrucesAnuales === 1 ? 'cruce activo' : 'cruces activos'}
                          </strong>{' '}
                          en el año ({rule === 'DEPT' ? 'por dependencia' : 'global'})
                        </>
                      ) : (
                        <>
                          <strong className="ok">● Sin cruces</strong> en el año
                        </>
                      )
                    ) : (
                      (() => {
                        const conflicts = AnalizadorCrucesVacaciones.obtenerConflictosDe(
                          trabajadorSeleccionado,
                          todosLosRegistros,
                          rule,
                        );
                        if (conflicts.length === 0) {
                          return (
                            <>
                              <strong className="ok">● {trabajadorSeleccionado.name}</strong> (
                              {trabajadorSeleccionado.getRangoCorto()}) sin cruces
                            </>
                          );
                        }
                        const names = conflicts
                          .map((c) => `${c.other.name} (${c.overlap.days} días)`)
                          .join(', ');
                        return (
                          <>
                            <strong className="conflict">
                              ● {trabajadorSeleccionado.name} se cruza con:
                            </strong>{' '}
                            {names}
                          </>
                        );
                      })()
                    )}
                  </div>
                </div>

                {/* VISTA 1: CALENDARIO MENSUAL (LUN A DOM) */}
                {mode === 'calendar' && (
                  <div>
                    <div className="vac-weekdays">
                      <div>lun</div>
                      <div>mar</div>
                      <div>mié</div>
                      <div>jue</div>
                      <div>vie</div>
                      <div>sáb</div>
                      <div>dom</div>
                    </div>
                    <div className="vac-cal-grid">
                      {celdasMes.map((cell) => {
                        const activeWorkers = trabajadoresFiltrados.filter((w) =>
                          w.estaActivaEnFecha(cell.iso),
                        );
                        const deptCounts: Record<string, number> = {};
                        for (const w of activeWorkers) {
                          deptCounts[w.dept] = (deptCounts[w.dept] || 0) + 1;
                        }

                        let cellClass = 'vac-cal-cell';
                        if (!cell.isCurrentMonth) cellClass += ' outside';
                        else if (cell.isHoliday) cellClass += ' holiday';
                        else if (cell.isWeekend) cellClass += ' weekend';

                        return (
                          <div key={cell.iso} className={cellClass}>
                            <div className="vac-cell-top">
                              <span
                                className="vac-holiday-tag"
                                title={cell.holidayName || undefined}
                              >
                                {cell.isHoliday ? `Festivo · ${cell.holidayName}` : ''}
                              </span>
                              <span className="vac-day-num">
                                {cell.dayNum}
                                {cell.monthTag}
                              </span>
                            </div>
                            <div className="vac-cell-events">
                              {activeWorkers.map((w) => {
                                const isStart = w.start === cell.iso;
                                const isEnd = w.end === cell.iso;
                                const hasDeptConflictToday = (deptCounts[w.dept] || 0) > 1;
                                const hasGlobalConflictToday =
                                  rule === 'GLOBAL' && activeWorkers.length > 1;
                                const isConflictToday =
                                  hasDeptConflictToday || hasGlobalConflictToday;

                                let pillClass = 'vac-pill';
                                if (isStart) pillClass += ' start';
                                if (isEnd) pillClass += ' end';

                                if (trabajadorSeleccionado) {
                                  if (w.id === trabajadorSeleccionado.id) {
                                    pillClass += ' selected';
                                  } else {
                                    const ov = AnalizadorCrucesVacaciones.calcularTraslape(
                                      trabajadorSeleccionado.start,
                                      trabajadorSeleccionado.end,
                                      w.start,
                                      w.end,
                                    );
                                    if (ov && cell.iso >= ov.start && cell.iso <= ov.end) {
                                      pillClass +=
                                        w.dept === trabajadorSeleccionado.dept || rule === 'GLOBAL'
                                          ? ' conflict-strong'
                                          : ' conflict-other';
                                    } else {
                                      pillClass += ' dimmed';
                                    }
                                  }
                                } else if (isConflictToday) {
                                  pillClass += ' conflict';
                                } else if (w.status === 'en_tramite') {
                                  pillClass += ' en-tramite';
                                }

                                return (
                                  <div
                                    key={w.id}
                                    className={pillClass}
                                    onClick={() => seleccionarTrabajador(w.id)}
                                    title={`${w.name} (${w.dept}): ${w.getRangoCorto()} · ${w.getEtiquetaEstado()}`}
                                  >
                                    <span>{w.name}</span>
                                    <small style={{ fontSize: 8, opacity: 0.85 }}>
                                      {isConflictToday && !trabajadorSeleccionado
                                        ? 'Cruce'
                                        : w.status === 'en_tramite'
                                          ? 'Trámite'
                                          : 'Concedida'}
                                    </small>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* VISTA 2: PANORAMA ANUAL COMPLETO (ENE–DIC) + PLAN ANUAL POR DEPENDENCIA */}
                {mode === 'annual' && (
                  <div>
                    <div className="vac-annual-head">
                      <div>Funcionario</div>
                      <div className="vac-annual-months">
                        {CalendarioLaboralColombia.MESES_CORTOS.map((m, idx) => (
                          <button key={m} type="button" onClick={() => cambiarMes(idx)}>
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="vac-annual-rows">
                      {trabajadoresFiltrados.map((w) => {
                        const { leftPct, widthPct } = w.calcularPosicionAnual(year);
                        const conflicts = AnalizadorCrucesVacaciones.obtenerConflictosDe(
                          w,
                          todosLosRegistros,
                          rule,
                        );
                        let rowClass = 'vac-annual-row';
                        let barClass = 'vac-annual-bar';

                        if (trabajadorSeleccionado) {
                          if (w.id === trabajadorSeleccionado.id) {
                            barClass += ' selected';
                          } else {
                            const ov = AnalizadorCrucesVacaciones.calcularTraslape(
                              trabajadorSeleccionado.start,
                              trabajadorSeleccionado.end,
                              w.start,
                              w.end,
                            );
                            if (ov) {
                              barClass +=
                                w.dept === trabajadorSeleccionado.dept || rule === 'GLOBAL'
                                  ? ' conflict-strong'
                                  : ' conflict-other';
                            } else {
                              rowClass += ' dimmed';
                            }
                          }
                        } else if (conflicts.length > 0) {
                          barClass += ' conflict';
                        } else if (w.status === 'en_tramite') {
                          barClass += ' en-tramite';
                        }

                        return (
                          <div
                            key={w.id}
                            className={rowClass}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); seleccionarTrabajador(w.id); } }}
                            onClick={() => seleccionarTrabajador(w.id)}
                          >
                            <div style={{ paddingRight: 10, minWidth: 0 }}>
                              <div className="vac-worker-name">{w.name}</div>
                              <div className="vac-worker-sub">
                                {w.dept} · {w.getRangoCorto()}
                              </div>
                            </div>
                            <div className="vac-annual-track">
                              {Array.from({ length: 11 }, (_, idx) => (
                                <div
                                  key={idx}
                                  className="vac-annual-divider"
                                  style={{ left: `${((idx + 1) / 12) * 100}%` }}
                                />
                              ))}
                              {w.tieneFechas() && (
                                <div
                                  className={barClass}
                                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                                  title={`${w.name}: ${w.getRangoCorto()} (${w.businessDays} días hábiles)`}
                                >
                                  <span>{w.getRangoCorto()}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Tabla del Plan Anual por Dependencia (Sección 6.2 de la Guía) */}
                    <div style={{ marginTop: 22 }}>
                      <div className="vac-sidebar-header" style={{ marginBottom: 10 }}>
                        <span>
                          PLAN ANUAL DETALLADO POR DEPENDENCIA ({trabajadoresFiltrados.length}{' '}
                          FUNCIONARIOS)
                        </span>
                        <a
                          className="text-link"
                          href={`/modulos/vacaciones/reporte/${currentDept !== 'ALL' ? `?q=${encodeURIComponent(currentDept)}` : ''}`}
                        >
                          ↓ Exportar plan CSV
                        </a>
                      </div>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Funcionario / Cargo</th>
                              <th>Dependencia</th>
                              <th>Periodo / Saldo</th>
                              <th>Inicio</th>
                              <th>Días hábiles</th>
                              <th>Último día / Reintegro</th>
                              <th>Estado</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {trabajadoresFiltrados.map((w) => {
                              const conflicts = AnalizadorCrucesVacaciones.obtenerConflictosDe(
                                w,
                                todosLosRegistros,
                                rule,
                              );
                              return (
                                <tr key={w.id}>
                                  <td>
                                    <strong>{w.name}</strong>
                                    <small>{w.role}</small>
                                  </td>
                                  <td>{w.dept}</td>
                                  <td>
                                    {w.periodLabel}
                                    <small>Saldo: {w.balanceDays} días hábiles</small>
                                  </td>
                                  <td>{w.start || '—'}</td>
                                  <td>{w.businessDays} días</td>
                                  <td>
                                    {w.end || '—'}
                                    <small>Reintegro: {w.returnDate || '—'}</small>
                                  </td>
                                  <td>
                                    <span
                                      className={`badge ${
                                        conflicts.length > 0
                                          ? 'danger'
                                          : w.status === 'concedida'
                                            ? 'success'
                                            : 'warning'
                                      }`}
                                    >
                                      {conflicts.length > 0
                                        ? `En cruce (${conflicts.length})`
                                        : w.stageLabel}
                                    </span>
                                  </td>
                                  <td>
                                    {w.caseId ? (
                                      <AppLink
                                        className="text-link"
                                        to={`/expedientes/${w.caseId}`}
                                      >
                                        Expediente →
                                      </AppLink>
                                    ) : (
                                      <button
                                        type="button"
                                        className="text-link"
                                        style={{ background: 'none', border: 'none' }}
                                        onClick={() => {
                                          setSimWorkerId(w.id);
                                          setSimStart(w.start || `${year}-06-16`);
                                          setSimDays(w.businessDays || 15);
                                          setModalOpen(true);
                                        }}
                                      >
                                        Radicar →
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="vac-canvas-foot">
                <span>
                  Al elegir un funcionario en la lista izquierda, el calendario salta
                  automáticamente al mes de sus vacaciones y resalta posibles cruces.
                </span>
                <span>
                  Calendario registrado de {year} ({festivosDelAnio.length} festivos
                  computados)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* MODO 3: LISTADO DE EXPEDIENTES DE VACACIONES */}
        {mode === 'cases' && casesVm && (
          <div className="padded">
            <form className="filters" style={{ padding: '0 0 18px' }} onSubmit={handleCaseFilterSubmit}>
              <div className="field">
                <label htmlFor="vac-search-cases">Buscar funcionario o dependencia</label>
                <input
                  id="vac-search-cases"
                  type="search"
                  placeholder="Nombre, usuario o dependencia…"
                  value={caseQ}
                  onChange={(e) => setCaseQ(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="vac-state-cases">Estado</label>
                <select
                  id="vac-state-cases"
                  value={caseState}
                  onChange={(e) => setCaseState(e.target.value)}
                >
                  <option value="">Todos los estados</option>
                  {casesVm.dto.states.map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="vac-from-cases">Registrado desde</label>
                <input
                  id="vac-from-cases"
                  type="date"
                  value={caseFrom}
                  onChange={(e) => setCaseFrom(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="vac-until-cases">Hasta</label>
                <input
                  id="vac-until-cases"
                  type="date"
                  value={caseUntil}
                  onChange={(e) => setCaseUntil(e.target.value)}
                />
              </div>
              <button className="btn secondary" type="submit">
                Filtrar
              </button>
              <a className="btn secondary" href={casesVm.dto.report_url}>
                ↓ Exportar CSV
              </a>
            </form>

            {casesVm.expedientes.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Expediente / fecha</th>
                      <th>Solicitante</th>
                      <th>Periodo de disfrute</th>
                      <th>Etapa y avance</th>
                      <th>Seguimiento</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {casesVm.expedientes.map((exp) => {
                      const per = exp.getResumenPeriodo();
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
                            {per.principal}
                            <small>
                              {per.secundario} ·{' '}
                              {exp.data.business_days
                                ? `${String(exp.data.business_days)} días hábiles`
                                : ''}
                            </small>
                          </td>
                          <td>
                            <span className={exp.getBadgeEstadoClass()}>{exp.stageLabel}</span>
                            <progress
                              className="mini-progress"
                              value={exp.progress}
                              max={100}
                            ></progress>
                          </td>
                          <td>
                            {exp.overdue ? (
                              <span className="badge danger">Plazo vencido</span>
                            ) : exp.dueAt ? (
                              <small>Vence {FormateadorTexto.fechaCorta(exp.dueAt)}</small>
                            ) : (
                              <small>
                                Reintegro: {String(exp.data.return_date || 'Por calcular')}
                              </small>
                            )}
                          </td>
                          <td>
                            <AppLink className="row-link" to={`/expedientes/${exp.id}`}>
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
                <span className="empty-icon">☀</span>
                <h3>Aún no hay expedientes de vacaciones radicados</h3>
                <p>
                  Puede simular fechas en el calendario anual o crear la primera solicitud oficial
                  de vacaciones.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14 }}>
                  <button type="button" className="btn secondary" onClick={abrirSimulador}>
                    Simular programación
                  </button>
                  <AppLink className="btn primary" to="/modulos/vacaciones/nuevo">
                    Crear solicitud →
                  </AppLink>
                </div>
              </div>
            )}

            {casesVm.dto.num_pages > 1 && (
              <div className="pagination">
                <span>
                  Página {casePage} de {casesVm.dto.num_pages}
                </span>
                <div>
                  {casesVm.dto.has_previous && (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => {
                        const prev = casePage - 1;
                        setCasePage(prev);
                        void cargarTodo(year, {
                          q: caseQ,
                          state: caseState,
                          from: caseFrom,
                          until: caseUntil,
                          page: String(prev),
                        });
                      }}
                    >
                      ← Anterior
                    </button>
                  )}
                  {casesVm.dto.has_next && (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => {
                        const next = casePage + 1;
                        setCasePage(next);
                        void cargarTodo(year, {
                          q: caseQ,
                          state: caseState,
                          from: caseFrom,
                          until: caseUntil,
                          page: String(next),
                        });
                      }}
                    >
                      Siguiente →
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* MODO 4: SALDOS POR PERIODO Y FESTIVOS DE COLOMBIA (SECCIONES 6.3 Y 6.4) */}
        {mode === 'balances' && (
          <div className="padded">
            <div className="admin-layout">
              <div>
                <h3 style={{ marginBottom: 6 }}>Periodos causados y saldos de funcionarios</h3>
                <p className="help" style={{ marginBottom: 14 }}>
                  Decreto 1045 de 1978: 15 días hábiles por año de servicio, prescripción a los 4
                  años y consumo obligatorio del periodo más antiguo disponible.
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Funcionario</th>
                        <th>Dependencia / Ingreso</th>
                        <th>Periodos causados</th>
                        <th>Saldo disponible</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashData.employees.map((emp) => (
                        <tr key={emp.id}>
                          <td>
                            <strong>{emp.name}</strong>
                            <small>{emp.role}</small>
                          </td>
                          <td>
                            {emp.dept}
                            <small>
                              {emp.hire_date
                                ? `Ingreso: ${emp.hire_date}`
                                : 'Sin fecha de ingreso'}
                            </small>
                          </td>
                          <td>
                            {emp.problem ? (
                              <small className="muted">{emp.problem}</small>
                            ) : emp.periods.length > 0 ? (
                              emp.periods.map((p) => (
                                <div key={p.number} style={{ marginBottom: 4 }}>
                                  <span
                                    className={`badge ${
                                      p.prescribed
                                        ? 'danger'
                                        : p.balance > 0
                                          ? 'success'
                                          : ''
                                    }`}
                                  >
                                    {p.label}: {p.balance}d disp.
                                    {p.reserved > 0 ? ` (${p.reserved}d reserv.)` : ''}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <small className="muted">Sin periodos causados aún</small>
                            )}
                          </td>
                          <td>
                            <strong>{emp.total_balance} días hábiles</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h3 style={{ marginTop: 28, marginBottom: 8 }}>
                  Festivos de Colombia registrados ({year})
                </h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Nombre del festivo registrado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {festivosDelAnio.map((h) => (
                        <tr key={h.date}>
                          <td>
                            <strong>{FormateadorTexto.fechaCorta(h.date)}</strong>
                            <small>{h.date}</small>
                          </td>
                          <td>{h.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/*Formularios de Talento Humano: Saldos iniciales y Festivos */}
              <div>
                <section className="card" style={{ marginBottom: 18 }}>
                  <header className="card-heading">
                    <div>
                      <h2>Registrar saldo inicial</h2>
                      <p>Descuenta días ya disfrutados antes de usar el sistema.</p>
                    </div>
                  </header>
                  <form className="card-body" onSubmit={handleInitialBalanceSubmit} aria-busy={busy}>
                    <div className="field">
                      <label htmlFor="init-emp">Funcionario</label>
                      <select
                        id="init-emp"
                        value={initEmpId}
                        onChange={(e) => setInitEmpId(e.target.value)}
                        required
                      >
                        {dashData.employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.name} · {emp.dept}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="init-period">Número de periodo causado</label>
                      <input
                        id="init-period"
                        type="number"
                        min={1}
                        max={40}
                        required
                        value={initPeriodNum}
                        onChange={(e) => setInitPeriodNum(Number(e.target.value))}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="init-days">Días hábiles ya disfrutados (1–15)</label>
                      <input
                        id="init-days"
                        type="number"
                        min={1}
                        max={15}
                        required
                        value={initDays}
                        onChange={(e) => setInitDays(Number(e.target.value))}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="init-note">Fuente documental (resolución u hoja de vida)</label>
                      <textarea
                        id="init-note"
                        rows={2}
                        required
                        placeholder="Ej. Resolución 042 de 2025 · disfrutar 10 días del Periodo 1"
                        value={initNote}
                        onChange={(e) => setInitNote(e.target.value)}
                      />
                    </div>
                    <button className="btn primary full" type="submit" disabled={busy}>
                      Registrar saldo inicial →
                    </button>
                  </form>
                </section>

                <section className="card">
                  <header className="card-heading">
                    <div>
                      <h2>Agregar o corregir festivo</h2>
                      <p>Se descuenta automáticamente del conteo de días hábiles.</p>
                    </div>
                  </header>
                  <form className="card-body" onSubmit={handleSaveHolidaySubmit} aria-busy={busy}>
                    <div className="field">
                      <label htmlFor="hol-date">Fecha del festivo</label>
                      <input
                        id="hol-date"
                        type="date"
                        required
                        value={holidayDate}
                        onChange={(e) => setHolidayDate(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="hol-name">Nombre de la festividad</label>
                      <input
                        id="hol-name"
                        type="text"
                        required
                        placeholder="Ej. Día cívico municipal"
                        value={holidayName}
                        onChange={(e) => setHolidayName(e.target.value)}
                      />
                    </div>
                    <button className="btn secondary full" type="submit" disabled={busy}>
                      Guardar festivo →
                    </button>
                  </form>
                </section>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal para Simular o Programar Vacaciones en cualquier mes del año */}
      {modalOpen && (
        <dialog
          ref={modalRef}
          className="vac-modal-backdrop"
          onClose={() => setModalOpen(false)}
          onCancel={(event) => { if (busy) event.preventDefault(); }}
          aria-modal="true"
          aria-label="Programar o simular vacaciones"
        >
          <div className="vac-modal" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
              }}
            >
              <div>
                <h3 style={{ margin: 0 }}>Programar o simular vacaciones ({year})</h3>
                <p className="help" style={{ margin: '2px 0 0' }}>
                  Calcula días hábiles descontando sábados, domingos y festivos, y verifica cruces
                </p>
              </div>
              <button
                type="button"
                className="btn secondary"
                style={{ minHeight: 30, padding: '4px 10px' }}
                onClick={() => setModalOpen(false)}
              >
                Cerrar
              </button>
            </div>

            <form onSubmit={handleRadicarDesdeSimulador} aria-busy={busy}>
              <div className="field">
                <label htmlFor="sim-worker-select">Funcionario de referencia (para cruce de área)</label>
                <select
                  id="sim-worker-select"
                  value={simWorkerId}
                  onChange={(e) => setSimWorkerId(e.target.value)}
                >
                  {(dashData.employees.length ? dashData.employees : [{ id: usuario.id, name: usuario.nombreCompleto, dept: usuario.dependencia }]).map((w) => (
                    <option key={w.id} value={String(w.id)}>
                      {w.name} · {w.dept}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label htmlFor="sim-start-date">Fecha de inicio (día hábil)</label>
                  <input
                    id="sim-start-date"
                    min={`${year}-01-01`}
                    max={`${year}-12-31`}
                    type="date"
                    required
                    value={simStart}
                    onChange={(e) => setSimStart(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="sim-business-days">Días hábiles a disfrutar</label>
                  <select
                    id="sim-business-days"
                    value={simDays}
                    onChange={(e) => setSimDays(Number(e.target.value))}
                  >
                    <option value={15}>15 días hábiles (periodo completo)</option>
                    <option value={10}>10 días hábiles</option>
                    <option value={8}>8 días hábiles</option>
                    <option value={5}>5 días hábiles</option>
                  </select>
                </div>
              </div>

              {/* Diagnóstico en vivo */}
              {resultadoSimulacion.sameDeptConflicts.length > 0 ? (
                <div className="vac-sim-feedback danger">
                  <strong>
                    ● No disponible · Cruce en {workerSimulado.dept}
                  </strong>
                  <div>
                    Periodo calculado:{' '}
                    <strong>
                      {CalendarioLaboralColombia.formatearCorto(resultadoSimulacion.startIso)} al{' '}
                      {CalendarioLaboralColombia.formatearCorto(resultadoSimulacion.endIso)}
                    </strong>{' '}
                    ({resultadoSimulacion.calendarDays} días calendario · Reintegro:{' '}
                    {CalendarioLaboralColombia.formatearCorto(resultadoSimulacion.returnIso)}).
                  </div>
                  <div>
                    Coincide con:{' '}
                    <strong>
                      {resultadoSimulacion.sameDeptConflicts
                        .map((c) => `${c.other.name} (${c.overlap.days} días)`)
                        .join(', ')}
                    </strong>
                    .
                  </div>
                </div>
              ) : resultadoSimulacion.otherDeptConflicts.length > 0 ? (
                <div className="vac-sim-feedback warning">
                  <strong>
                    ● Disponible en {workerSimulado.dept} (coincide con otra área)
                  </strong>
                  <div>
                    Periodo calculado:{' '}
                    <strong>
                      {CalendarioLaboralColombia.formatearCorto(resultadoSimulacion.startIso)} al{' '}
                      {CalendarioLaboralColombia.formatearCorto(resultadoSimulacion.endIso)}
                    </strong>{' '}
                    ({simDays} días hábiles · Reintegro:{' '}
                    {CalendarioLaboralColombia.formatearCorto(resultadoSimulacion.returnIso)}).
                  </div>
                  <div>
                    Coincide con:{' '}
                    {resultadoSimulacion.otherDeptConflicts
                      .map((c) => `${c.other.name} (${c.other.dept})`)
                      .join(', ')}
                    .
                  </div>
                </div>
              ) : (
                <div className="vac-sim-feedback ok">
                  <strong>Sin cruces registrados para estas fechas</strong>
                  <div>
                    Del{' '}
                    <strong>
                      {CalendarioLaboralColombia.formatearCorto(resultadoSimulacion.startIso)} al{' '}
                      {CalendarioLaboralColombia.formatearCorto(resultadoSimulacion.endIso)}
                    </strong>{' '}
                    ({simDays} días hábiles, {resultadoSimulacion.calendarDays} calendario ·
                    Reintegro previsto:{' '}
                    <strong>
                      {CalendarioLaboralColombia.formatearCorto(resultadoSimulacion.returnIso)}
                    </strong>
                    ).
                  </div>
                </div>
              )}

              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="sim-obs">Observaciones para la solicitud (opcional)</label>
                <input
                  id="sim-obs"
                  type="text"
                  placeholder="Ej. Programación concertada en plan anual de vacaciones"
                  value={simObservations}
                  onChange={(e) => setSimObservations(e.target.value)}
                />
              </div>

              <div className="form-actions" style={{ marginTop: 14, paddingTop: 14 }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setModalOpen(false)}
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={busy || !ownSimulation || resultadoSimulacion.sameDeptConflicts.length > 0 || !calendario.esDiaHabil(CalendarioLaboralColombia.parseISO(simStart))}
                >
                  {!ownSimulation ? 'Solo consulta: no crea una solicitud de otra persona' : resultadoSimulacion.sameDeptConflicts.length > 0
                    ? 'No disponible por cruce en dependencia'
                    : 'Crear mi borrador con estas fechas'}
                </button>
              </div>
            </form>
          </div>
        </dialog>
      )}
    </>
  );
}
