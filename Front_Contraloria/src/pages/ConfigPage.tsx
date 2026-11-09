import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AppLink } from '../components/AppLink';
import { FormateadorTexto } from '../domain/Formatters';
import type { ConfigurationDTO } from '../domain/types';
import { ApiError } from '../services/HttpClient';
import { appServices } from '../services/ServiceContainer';

interface ConfigPageProps {
  onNotify: (type: 'success' | 'error' | 'warning', text: string) => void;
}

const DEFAULT_CONFIG_JSON = JSON.stringify(
  {
    roles: {},
    deadlines: {},
    additional_documents: {},
    milestones: [],
    transitions: [],
  },
  null,
  2,
);

export function ConfigPage({ onNotify }: ConfigPageProps) {
  const [data, setData] = useState<ConfigurationDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Estado formulario de política
  const [polKind, setPolKind] = useState('incapacidad');
  const [polSource, setPolSource] = useState('');
  const [polPages, setPolPages] = useState('');
  const [polApproval, setPolApproval] = useState('');
  const [polConfig, setPolConfig] = useState(DEFAULT_CONFIG_JSON);
  const [polConfirmed, setPolConfirmed] = useState(false);

  // Estado formulario de escala
  const [scaleName, setScaleName] = useState('');
  const [scaleCategory, setScaleCategory] = useState('');
  const [scaleDestination, setScaleDestination] = useState('');
  const [scaleValidFrom, setScaleValidFrom] = useState('');
  const [scaleValidUntil, setScaleValidUntil] = useState('');
  const [scaleOvernightRate, setScaleOvernightRate] = useState('');
  const [scaleDayRate, setScaleDayRate] = useState('');
  const [scaleSource, setScaleSource] = useState('');
  const [scaleApproval, setScaleApproval] = useState('');

  const cargar = useCallback(async () => {
    try {
      const res = await appServices.admin.obtenerConfiguracion();
      setData(res);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error consultando configuración.');
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    let active = true;
    appServices.admin
      .obtenerConfiguracion()
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) {
          onNotify('error', err instanceof Error ? err.message : 'Error consultando configuración.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onNotify]);

  const handlePolicySubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!window.confirm('¿Confirma la aprobación institucional de esta versión y sus parámetros?')) {
      return;
    }
    setBusy(true);
    try {
      const msg = await appServices.admin.registrarPolitica({
        kind: polKind,
        source: polSource,
        source_pages: polPages,
        approval_reference: polApproval,
        config: polConfig,
        confirmed: polConfirmed,
      });
      setPolSource('');
      setPolPages('');
      setPolApproval('');
      setPolConfirmed(false);
      onNotify('success', msg);
      await cargar();
    } catch (err) {
      if (err instanceof ApiError) {
        err.errors.forEach((m) => onNotify('error', m));
      } else {
        onNotify('error', 'No fue posible registrar la versión.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleScaleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (
      !window.confirm(
        '¿Confirma que estas tarifas, vigencias y fuente fueron aprobadas institucionalmente?',
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const msg = await appServices.admin.registrarEscala({
        name: scaleName,
        category: scaleCategory,
        destination: scaleDestination,
        valid_from: scaleValidFrom,
        valid_until: scaleValidUntil,
        overnight_rate: scaleOvernightRate,
        day_rate: scaleDayRate,
        source: scaleSource,
        approval_reference: scaleApproval,
      });
      setScaleName('');
      setScaleCategory('');
      setScaleDestination('');
      setScaleValidFrom('');
      setScaleValidUntil('');
      setScaleOvernightRate('');
      setScaleDayRate('');
      setScaleSource('');
      setScaleApproval('');
      onNotify('success', msg);
      await cargar();
    } catch (err) {
      if (err instanceof ApiError) {
        err.errors.forEach((m) => onNotify('error', m));
      } else {
        onNotify('error', 'No fue posible registrar la escala.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!data && loading) {
    return (
      <section className="card padded">
        <p className="muted">Cargando parámetros y normativa…</p>
      </section>
    );
  }

  if (!data) return null;

  return (
    <>
      <div className="breadcrumb">
        <AppLink to="/">Inicio</AppLink>
        <span>/</span>
        Configuración
      </div>
      <header className="page-heading">
        <div>
          <div className="eyebrow">FUENTES, VIGENCIAS Y APROBACIONES</div>
          <h1>Parámetros y normativa</h1>
          <p>
            Cada versión conserva su fuente y aprobación. Los expedientes mantienen la versión con
            la que se abrieron.
          </p>
        </div>
      </header>

      <div className="notice">
        <span className="notice-icon">i</span>
        <div>
          <strong>Validación institucional requerida</strong>
          <p>
            Las fuentes oficiales no están incorporadas y no se ha recibido el procedimiento de
            compensatorios. Contraste responsables, transiciones, límites, equivalencias, requisitos
            y condiciones antes de aprobar y habilitar una versión.
          </p>
        </div>
      </div>

      <section className="card">
        <header className="card-heading">
          <h2>Versiones de procedimientos</h2>
          <AppLink className="text-link" to="/procedimientos">
            Consultar flujo propuesto ↗
          </AppLink>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Procedimiento / versión</th>
                <th>Estado</th>
                <th>Fuente y páginas</th>
                <th>Aprobación</th>
              </tr>
            </thead>
            <tbody>
              {data.policies.length > 0 ? (
                data.policies.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.kind_display} · v{p.version}
                      <small>{FormateadorTexto.fechaCorta(p.created_at)}</small>
                    </td>
                    <td>
                      {p.confirmed ? (
                        <span className="badge success">Confirmada por autoridad</span>
                      ) : (
                        <span className="badge warning">Provisional</span>
                      )}
                    </td>
                    <td>
                      {p.source}
                      <small>{p.source_pages}</small>
                    </td>
                    <td>
                      {p.approval_reference || 'Pendiente'}
                      <small>{p.created_by}</small>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>
                    Las versiones provisionales se crean al registrar el primer expediente de cada
                    módulo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {data.can_approve && (
        <details className="card padded">
          <summary className="text-link">＋ Aprobar una nueva versión de procedimiento</summary>
          <p>
            Esta declaración registra su aprobación. Revise el flujo propuesto completo antes de
            continuar. Los expedientes provisionales previos conservan su carácter de prueba.
          </p>
          <form onSubmit={handlePolicySubmit} className="form-card" aria-busy={busy}>
            <div className="field">
              <label htmlFor="pol-kind">Procedimiento</label>
              <select
                id="pol-kind"
                value={polKind}
                onChange={(e) => setPolKind(e.target.value)}
              >
                {data.kinds.map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pol-source">
                Documento oficial y ubicación de la fuente <span className="required">*</span>
              </label>
              <textarea
                id="pol-source"
                rows={2}
                required
                value={polSource}
                onChange={(e) => setPolSource(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="pol-pages">
                Páginas, tablas y diagramas verificados <span className="required">*</span>
              </label>
              <input
                id="pol-pages"
                type="text"
                required
                value={polPages}
                onChange={(e) => setPolPages(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="pol-approval">
                Referencia de aprobación institucional <span className="required">*</span>
              </label>
              <input
                id="pol-approval"
                type="text"
                required
                value={polApproval}
                onChange={(e) => setPolApproval(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="pol-config">
                Responsables, transiciones, límites, requisitos e hitos (JSON){' '}
                <span className="required">*</span>
              </label>
              <textarea
                id="pol-config"
                rows={10}
                required
                value={polConfig}
                onChange={(e) => setPolConfig(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="pol-confirmed" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  id="pol-confirmed"
                  type="checkbox"
                  checked={polConfirmed}
                  onChange={(e) => setPolConfirmed(e.target.checked)}
                />
                <span>
                  Confirmo que contrasté el flujo con las fuentes y tengo competencia para aprobar
                  esta versión
                </span>
              </label>
            </div>
            <button className="btn primary" type="submit" disabled={busy}>
              Registrar versión aprobada
            </button>
          </form>
        </details>
      )}

      <section className="card">
        <header className="card-heading">
          <div>
            <h2>Configuración de compensatorios</h2>
            <p>
              Catálogo de decisiones que deben respaldarse con el procedimiento institucional antes
              de habilitar movimientos.
            </p>
          </div>
          <span className="badge warning">Bloqueado por defecto</span>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Parámetro</th>
                <th>Propósito</th>
                <th>Condición técnica</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>roles</code> y <code>transitions</code>
                </td>
                <td>Responsables y avances autorizados por etapa</td>
                <td>No pueden omitir controles obligatorios</td>
              </tr>
              <tr>
                <td>
                  <code>minutes_per_day</code>
                </td>
                <td>Equivalencia institucional de horas/minutos a días</td>
                <td>Entero positivo; no se presume ningún valor</td>
              </tr>
              <tr>
                <td>
                  <code>min_credit_minutes</code> / <code>max_credit_minutes</code>
                </td>
                <td>Límites del tiempo reconocible</td>
                <td>Requeridos para habilitar</td>
              </tr>
              <tr>
                <td>
                  <code>min_request_minutes</code> / <code>max_request_minutes</code>
                </td>
                <td>Límites de cada solicitud</td>
                <td>Requeridos para habilitar</td>
              </tr>
              <tr>
                <td>
                  <code>requirements</code>
                </td>
                <td>Requisitos documentales y operativos confirmados</td>
                <td>Lista no vacía</td>
              </tr>
              <tr>
                <td>
                  <code>approval_conditions</code>
                </td>
                <td>Condiciones verificadas para reconocer y descontar</td>
                <td>Lista no vacía</td>
              </tr>
              <tr>
                <td>
                  <code>enabled</code>
                </td>
                <td>Permite que las autorizaciones generen movimientos</td>
                <td>
                  Mantener en <code>false</code> sin fuente y aprobación
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <header className="card-heading">
          <div>
            <h2>Escalas de viáticos</h2>
            <p>Las tarifas se registran explícitamente por categoría, destino y vigencia.</p>
          </div>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Versión</th>
                <th>Categoría / destino</th>
                <th>Vigencia</th>
                <th>Con pernoctación</th>
                <th>Sin pernoctación</th>
                <th>Fuente / aprobación</th>
              </tr>
            </thead>
            <tbody>
              {data.scales.length > 0 ? (
                data.scales.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>
                      {s.category}
                      <small>{s.destination}</small>
                    </td>
                    <td>
                      {FormateadorTexto.fechaCorta(s.valid_from)}
                      <small>{FormateadorTexto.fechaCorta(s.valid_until)}</small>
                    </td>
                    <td>{FormateadorTexto.moneda(s.overnight_rate)}</td>
                    <td>{FormateadorTexto.moneda(s.day_rate)}</td>
                    <td>
                      {s.source}
                      <small>
                        {s.approval_reference} · {s.approved_by}
                      </small>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    No hay escalas registradas. La liquidación requiere una escala aprobada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {data.can_approve && (
        <details className="card padded">
          <summary className="text-link">＋ Registrar una escala aprobada</summary>
          <form onSubmit={handleScaleSubmit} className="form-card" aria-busy={busy}>
            <div className="field">
              <label htmlFor="scale-name">
                Nombre / versión de la escala <span className="required">*</span>
              </label>
              <input
                id="scale-name"
                type="text"
                required
                value={scaleName}
                onChange={(e) => setScaleName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="scale-cat">
                Categoría (debe coincidir con la solicitud) <span className="required">*</span>
              </label>
              <input
                id="scale-cat"
                type="text"
                required
                value={scaleCategory}
                onChange={(e) => setScaleCategory(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="scale-dest">
                Destino (debe coincidir con la solicitud) <span className="required">*</span>
              </label>
              <input
                id="scale-dest"
                type="text"
                required
                value={scaleDestination}
                onChange={(e) => setScaleDestination(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="scale-from">
                Vigente desde <span className="required">*</span>
              </label>
              <input
                id="scale-from"
                type="date"
                required
                value={scaleValidFrom}
                onChange={(e) => setScaleValidFrom(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="scale-until">
                Vigente hasta <span className="required">*</span>
              </label>
              <input
                id="scale-until"
                type="date"
                required
                value={scaleValidUntil}
                onChange={(e) => setScaleValidUntil(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="scale-overnight">
                Tarifa diaria con pernoctación (COP) <span className="required">*</span>
              </label>
              <input
                id="scale-overnight"
                type="number"
                step="0.01"
                min="0"
                required
                value={scaleOvernightRate}
                onChange={(e) => setScaleOvernightRate(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="scale-day">
                Tarifa diaria sin pernoctación (COP) <span className="required">*</span>
              </label>
              <input
                id="scale-day"
                type="number"
                step="0.01"
                min="0"
                required
                value={scaleDayRate}
                onChange={(e) => setScaleDayRate(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="scale-source">
                Fuente normativa y páginas verificadas <span className="required">*</span>
              </label>
              <textarea
                id="scale-source"
                rows={3}
                required
                value={scaleSource}
                onChange={(e) => setScaleSource(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="scale-approval">
                Referencia del acto de aprobación institucional <span className="required">*</span>
              </label>
              <input
                id="scale-approval"
                type="text"
                required
                value={scaleApproval}
                onChange={(e) => setScaleApproval(e.target.value)}
              />
            </div>
            <button className="btn primary" type="submit" disabled={busy}>
              Registrar escala versionada
            </button>
          </form>
        </details>
      )}
    </>
  );
}
