import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AppLink } from '../components/AppLink';
import { DynamicFields } from '../components/DynamicFields';
import type { ExpedienteBase } from '../domain/Expediente';
import { FormateadorTexto } from '../domain/Formatters';
import type { CaseKind } from '../domain/types';
import { ApiError } from '../services/HttpClient';
import { appServices } from '../services/ServiceContainer';

interface CaseDetailPageProps {
  caseId: string;
  onActiveKindChange: (kind: CaseKind | null) => void;
  onNotify: (type: 'success' | 'error' | 'warning', text: string) => void;
}

export function CaseDetailPage({
  caseId,
  onActiveKindChange,
  onNotify,
}: CaseDetailPageProps) {
  const [expediente, setExpediente] = useState<ExpedienteBase | null>(null);
  const [loading, setLoading] = useState(true);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [decisionNote, setDecisionNote] = useState('');
  const [followupNote, setFollowupNote] = useState('');
  const [uploadCategory, setUploadCategory] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Estado formulario financiero
  const [payKind, setPayKind] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState('');
  const [payReference, setPayReference] = useState('');
  const [payEvidence, setPayEvidence] = useState('');

  // Estado formulario reconocimiento adicional
  const [recAmount, setRecAmount] = useState('');
  const [recDocId, setRecDocId] = useState('');
  const [recNote, setRecNote] = useState('');

  // Estado formulario novedad de vacaciones
  const [intKind, setIntKind] = useState<'suspension' | 'aplazamiento'>('suspension');
  const [intDate, setIntDate] = useState('');
  const [intReason, setIntReason] = useState('');
  const [intDocId, setIntDocId] = useState('');

  const [busy, setBusy] = useState(false);

  const sincronizarEstadoLocal = useCallback(
    (exp: ExpedienteBase) => {
      setExpediente(exp);
      onActiveKindChange(exp.kind);
      const det = exp.detalle;
      if (det) {
        const initVals: Record<string, unknown> = {};
        for (const f of det.fields_schema) {
          initVals[f.key] = f.value;
        }
        setFormValues(initVals);
        if (det.upload_categories.length > 0) {
          setUploadCategory((prev) =>
            det.upload_categories.some((c) => c.key === prev)
              ? prev
              : det.upload_categories[0].key,
          );
        }
        if (det.payment_options) {
          if (det.payment_options.kinds.length > 0) {
            setPayKind((prev) => prev || det.payment_options!.kinds[0][0]);
          }
          if (det.payment_options.evidences.length > 0) {
            setPayEvidence((prev) => prev || String(det.payment_options!.evidences[0].id));
          }
        }
      }
    },
    [onActiveKindChange],
  );

  const cargar = useCallback(
    async (historyPage = 1) => {
      try {
        const exp = await appServices.expedientes.obtenerDetalle(caseId, historyPage);
        sincronizarEstadoLocal(exp);
      } catch (err) {
        onNotify('error', err instanceof Error ? err.message : 'No fue posible abrir el expediente.');
      } finally {
        setLoading(false);
      }
    },
    [caseId, onNotify, sincronizarEstadoLocal],
  );

  useEffect(() => {
    let active = true;
    appServices.expedientes
      .obtenerDetalle(caseId, 1)
      .then((exp) => {
        if (active) sincronizarEstadoLocal(exp);
      })
      .catch((err) => {
        if (active) {
          onNotify(
            'error',
            err instanceof Error ? err.message : 'No fue posible abrir el expediente.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      onActiveKindChange(null);
    };
  }, [caseId, onNotify, onActiveKindChange, sincronizarEstadoLocal]);

  if (!expediente && loading) {
    return (
      <section className="card padded">
        <p className="muted">Cargando expediente…</p>
      </section>
    );
  }

  if (!expediente || !expediente.detalle) return null;

  const det = expediente.detalle;
  const avisosEtapa = expediente.getAvisosEtapaActual(det.step?.key);
  const indicadoresFinancieros = expediente.getIndicadoresFinancieros();
  const scaleSnapshot = expediente.data.scale_snapshot as Record<string, unknown> | undefined;

  const handleSaveData = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFieldErrors({});
    try {
      const { expediente: actualizado, mensaje } = await appServices.expedientes.guardarDatos(
        expediente.id,
        expediente.revision,
        formValues,
      );
      sincronizarEstadoLocal(actualizado);
      onNotify('success', mensaje);
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors);
        err.errors.forEach((m) => onNotify('error', m));
      } else {
        onNotify('error', 'Error al guardar los datos.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDecision = async (
    action: 'advance' | 'return' | 'reject',
    confirmMessage: string,
  ) => {
    if (!window.confirm(confirmMessage)) return;
    setBusy(true);
    try {
      const { expediente: actualizado, mensaje } = await appServices.expedientes.ejecutarDecision(
        expediente.id,
        expediente.revision,
        action,
        decisionNote,
      );
      setDecisionNote('');
      sincronizarEstadoLocal(actualizado);
      onNotify('success', mensaje);
    } catch (err) {
      if (err instanceof ApiError) {
        err.errors.forEach((m) => onNotify('error', m));
      } else {
        onNotify('error', 'No fue posible ejecutar la actuación.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleFollowupSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { expediente: actualizado, mensaje } = await appServices.expedientes.ejecutarDecision(
        expediente.id,
        expediente.revision,
        'note',
        followupNote,
      );
      setFollowupNote('');
      sincronizarEstadoLocal(actualizado);
      onNotify('success', mensaje);
    } catch (err) {
      if (err instanceof ApiError) {
        err.errors.forEach((m) => onNotify('error', m));
      } else {
        onNotify('error', 'No fue posible registrar el seguimiento.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleUploadSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      onNotify('error', 'Seleccione un archivo PDF, PNG o JPG.');
      return;
    }
    setBusy(true);
    try {
      const { expediente: actualizado, mensaje } = await appServices.expedientes.subirDocumento(
        expediente.id,
        expediente.revision,
        uploadCategory,
        file,
      );
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      sincronizarEstadoLocal(actualizado);
      onNotify('success', mensaje);
    } catch (err) {
      if (err instanceof ApiError) {
        err.errors.forEach((m) => onNotify('error', m));
      } else {
        onNotify('error', 'No fue posible incorporar el documento.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePaymentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (
      !window.confirm(
        '¿Confirma que el movimiento fue realizado y está respaldado por el soporte seleccionado?',
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const { expediente: actualizado, mensaje } = await appServices.expedientes.registrarPago(
        expediente.id,
        {
          revision: expediente.revision,
          kind: payKind,
          amount: payAmount,
          paid_on: payDate,
          reference: payReference,
          evidence: Number(payEvidence),
        },
      );
      setPayAmount('');
      setPayDate('');
      setPayReference('');
      sincronizarEstadoLocal(actualizado);
      onNotify('success', mensaje);
    } catch (err) {
      if (err instanceof ApiError) {
        err.errors.forEach((m) => onNotify('error', m));
      } else {
        onNotify('error', 'No fue posible registrar el movimiento financiero.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRecognitionSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!window.confirm('¿Confirma el reconocimiento acumulado y su soporte?')) {
      return;
    }
    setBusy(true);
    try {
      const { expediente: actualizado, mensaje } =
        await appServices.expedientes.registrarReconocimiento(expediente.id, {
          revision: expediente.revision,
          recognized: recAmount,
          document_id: Number(recDocId),
          note: recNote,
        });
      setRecAmount('');
      setRecNote('');
      sincronizarEstadoLocal(actualizado);
      onNotify('success', mensaje);
    } catch (err) {
      if (err instanceof ApiError) {
        err.errors.forEach((m) => onNotify('error', m));
      } else {
        onNotify('error', 'No fue posible actualizar el reconocimiento.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleVacationInterruptionSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (
      !window.confirm(
        '¿Confirma la novedad? Los días devueltos quedarán registrados de forma permanente.',
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const { expediente: actualizado, mensaje } =
        await appServices.expedientes.registrarNovedadVacaciones(expediente.id, {
          revision: expediente.revision,
          kind: intKind,
          on_date: intDate,
          reason: intReason,
          document_id: Number(intDocId),
        });
      setIntDate('');
      setIntReason('');
      sincronizarEstadoLocal(actualizado);
      onNotify('success', mensaje);
    } catch (err) {
      if (err instanceof ApiError) {
        err.errors.forEach((m) => onNotify('error', m));
      } else {
        onNotify('error', 'No fue posible registrar la novedad de vacaciones.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="breadcrumb">
        <AppLink to="/">Inicio</AppLink>
        <span>/</span>
        <AppLink to={`/modulos/${expediente.kind}`}>{expediente.kindDisplay}</AppLink>
        <span>/</span>
        {expediente.reference}
      </div>
      <header className="page-heading">
        <div>
          <div className="eyebrow">
            EXPEDIENTE · {FormateadorTexto.fechaCorta(expediente.createdAt)}
          </div>
          <h1>
            {expediente.reference}{' '}
            <span className={expediente.getBadgeEstadoClass()}>{expediente.stageLabel}</span>
          </h1>
          <p>
            {expediente.ownerName} · {expediente.department} · {expediente.ownerEmployment}
          </p>
        </div>
        <AppLink className="btn secondary" to={`/modulos/${expediente.kind}`}>
          ← Volver a expedientes
        </AppLink>
      </header>

      {!expediente.policyConfirmed && (
        <div className="notice">
          <span className="notice-icon">i</span>
          <div>
            <strong>Flujo provisional · versión {expediente.policyVersion}</strong>
            <p>{expediente.getMensajeFlujoProvisional()}</p>
          </div>
        </div>
      )}

      {expediente.estaEnCorreccion() && (
        <div className="message warning">
          <strong>Correcciones solicitadas</strong>
          <p style={{ whiteSpace: 'pre-wrap' }}>{det.correction_fields}</p>
          <small>
            Corrija los datos y adjunte versiones actualizadas de los documentos exigidos. El
            historial anterior se conserva.
          </small>
        </div>
      )}

      <nav className="section-links" aria-label="Secciones del expediente">
        <a href="#gestion">Gestión de etapa</a>
        <a href="#resumen">Información</a>
        <a href="#finanzas">
          {expediente.kind === 'compensatorio' || expediente.kind === 'vacaciones'
            ? 'Saldos'
            : 'Finanzas'}
        </a>
        <a href="#documentos">Documentos</a>
        <a href="#historial">Historial</a>
      </nav>

      <div className="detail-layout">
        <aside className="card step-card">
          <div className="card-heading">
            <div>
              <h2>Recorrido del expediente</h2>
              <p>{expediente.progress}% de etapas recorridas</p>
            </div>
          </div>
          <progress
            value={expediente.progress}
            max={100}
            aria-label="Avance del expediente"
          ></progress>
          <ol className="steps">
            {det.steps.map((s, idx) => (
              <li
                key={s.key}
                className={`${s.done ? 'done' : ''} ${s.current ? 'current' : ''}`.trim()}
              >
                <span className="step-number">{s.done ? '✓' : idx + 1}</span>
                <div>
                  <strong>{s.label}</strong>
                  <small>{s.role_labels.join(', ')}</small>
                </div>
              </li>
            ))}
          </ol>
          <p className="help padded">
            Versión {expediente.policyVersion} · El avance representa etapas registradas. Cada
            actuación conserva su evidencia.
          </p>
        </aside>

        <div className="detail-main">
          <section className="card" id="gestion">
            <header className="card-heading">
              <div>
                <div className="eyebrow">ETAPA ACTUAL</div>
                <h2>{expediente.stageLabel}</h2>
                {det.step && <p>Responsable: {det.step.role_labels.join(', ')}</p>}
              </div>
              {expediente.overdue ? (
                <span className="badge danger">Plazo vencido</span>
              ) : expediente.dueAt ? (
                <span className="badge">Vence {FormateadorTexto.fechaHora(expediente.dueAt)}</span>
              ) : null}
            </header>
            <div className="card-body">
              {expediente.esTerminal() ? (
                <div className="empty compact">
                  <span className="empty-icon">{expediente.esCerrado() ? '✓' : '×'}</span>
                  <h3>Expediente {expediente.stage}</h3>
                  <p>Se conservan el expediente, los soportes y el historial de actuaciones.</p>
                </div>
              ) : det.can_edit ? (
                <>
                  {det.fields_schema.length > 0 && (
                    <form onSubmit={handleSaveData} aria-busy={busy}>
                      <DynamicFields
                        schema={det.fields_schema}
                        values={formValues}
                        fieldErrors={fieldErrors}
                        kind={expediente.kind}
                        onChange={(k, v) => setFormValues((prev) => ({ ...prev, [k]: v }))}
                      />
                      <div className="form-actions">
                        <small className="help">Guarde los datos antes de continuar la etapa.</small>
                        <button className="btn secondary" type="submit" disabled={busy}>
                          Guardar datos
                        </button>
                      </div>
                    </form>
                  )}

                  {det.required_documents.length > 0 && (
                    <div className="requirements">
                      <strong>Documentos exigidos para continuar</strong>
                      <ul>
                        {det.required_documents.map((docLabel, i) => (
                          <li key={i}>{docLabel}</li>
                        ))}
                      </ul>
                      <a className="text-link" href="#documentos">
                        Adjuntar documentos ↓
                      </a>
                    </div>
                  )}

                  {avisosEtapa.map((aviso, i) => (
                    <div key={i} className="notice compact">
                      <p>{aviso}</p>
                    </div>
                  ))}

                  <form
                    className="decision-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleDecision(
                        'advance',
                        '¿Confirma que verificó los requisitos y soportes de esta etapa?',
                      );
                    }}
                    aria-busy={busy}
                  >
                    <div className="field" style={{ marginTop: 18 }}>
                      <label htmlFor="decision-note">Observaciones de la actuación</label>
                      <textarea
                        id="decision-note"
                        rows={3}
                        maxLength={5000}
                        value={decisionNote}
                        onChange={(e) => setDecisionNote(e.target.value)}
                      />
                    </div>
                    <div className="form-actions">
                      <div>
                        {det.can_return && (
                          <button
                            className="btn secondary"
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void handleDecision(
                                'return',
                                '¿Devolver para corrección? Indique los documentos o campos que se deben corregir.',
                              )
                            }
                          >
                            Devolver
                          </button>
                        )}
                        {det.can_reject && (
                          <button
                            className="btn danger-button"
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void handleDecision(
                                'reject',
                                '¿Rechazar la solicitud? Debe registrar una justificación.',
                              )
                            }
                          >
                            Rechazar
                          </button>
                        )}
                      </div>
                      <button className="btn primary" type="submit" disabled={busy}>
                        {expediente.getTextoBotonAvance()} →
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="notice compact">
                  <span className="notice-icon">◷</span>
                  <div>
                    <strong>En espera del responsable</strong>
                    <p>
                      Esta etapa requiere la intervención del rol indicado. Puede consultar los
                      soportes y registrar seguimiento.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="card" id="resumen">
            <header className="card-heading">
              <div>
                <h2>Información del expediente</h2>
                <p>Datos registrados y decisiones documentadas.</p>
              </div>
              <span className="badge">{expediente.getEtiquetaDuracion()}</span>
            </header>
            {det.values.length > 0 ? (
              <dl className="data-grid">
                {det.values.map((row) => (
                  <div key={row.key}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className="padded">
                <p className="muted">Complete la información del borrador.</p>
              </div>
            )}

            {scaleSnapshot && (
              <details className="padded">
                <summary className="text-link">Consultar parámetros de la liquidación</summary>
                <dl className="data-grid">
                  {Object.entries(scaleSnapshot).map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
          </section>

          <section className="card" id="finanzas">
            <header className="card-heading">
              <div>
                <h2>{expediente.getTituloSeccionFinanzas()}</h2>
                <p>{expediente.getSubtituloSeccionFinanzas()}</p>
              </div>
            </header>
            <div className="financial-grid">
              {indicadoresFinancieros.map((ind, idx) => (
                <div key={idx}>
                  <span>{ind.label}</span>
                  <strong>{ind.value}</strong>
                </div>
              ))}
            </div>

            {det.vacation && (
              <>
                {det.vacation.problem && (
                  <div className="notice compact">
                    <p>{det.vacation.problem}</p>
                  </div>
                )}
                {det.vacation.periods.length > 0 && (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Periodo de causación</th>
                          <th>Saldo</th>
                          <th>Reservado en solicitudes</th>
                          <th>Prescribe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {det.vacation.periods.map((row) => (
                          <tr key={row.number}>
                            <td>{row.label}</td>
                            <td>{row.balance} días</td>
                            <td>{row.reserved} días</td>
                            <td>
                              {row.prescribed ? (
                                <span className="badge danger">Prescrito</span>
                              ) : (
                                FormateadorTexto.fechaCorta(row.prescribes_on)
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {det.vacation.entries.length > 0 && (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Movimiento</th>
                          <th>Fecha efectiva</th>
                          <th>Días</th>
                          <th>Periodo</th>
                          <th>Registró</th>
                        </tr>
                      </thead>
                      <tbody>
                        {det.vacation.entries.map((entry) => (
                          <tr key={entry.id}>
                            <td>{entry.kind_display}</td>
                            <td>{FormateadorTexto.fechaCorta(entry.effective_on)}</td>
                            <td>
                              {entry.kind === 'devolucion' ? '+' : '−'}
                              {entry.days}
                            </td>
                            <td>{entry.period_label}</td>
                            <td>{entry.actor}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {det.vacation.can_interrupt && (
                  <details className="padded">
                    <summary className="text-link">
                      ＋ Registrar suspensión o aplazamiento
                    </summary>
                    <p className="help">
                      Adjunte primero el soporte en Documentos. Los días no disfrutados vuelven al
                      mismo periodo y deben programarse antes de usar uno nuevo.
                    </p>
                    <form onSubmit={handleVacationInterruptionSubmit} aria-busy={busy}>
                      <div className="field">
                        <label htmlFor="int-kind">Novedad</label>
                        <select
                          id="int-kind"
                          value={intKind}
                          onChange={(e) =>
                            setIntKind(e.target.value as 'suspension' | 'aplazamiento')
                          }
                          required
                        >
                          <option value="suspension">Suspensión (durante el disfrute)</option>
                          <option value="aplazamiento">Aplazamiento (antes de iniciar)</option>
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="int-date">
                          Fecha desde la cual no se disfrutan los días
                        </label>
                        <input
                          id="int-date"
                          type="date"
                          required
                          value={intDate}
                          onChange={(e) => setIntDate(e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="int-doc">Soporte de la novedad</label>
                        <select
                          id="int-doc"
                          required
                          value={intDocId}
                          onChange={(e) => setIntDocId(e.target.value)}
                        >
                          <option value="">Seleccione un documento</option>
                          {det.vacation.interruption_documents.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="int-reason">Motivo y acto que la soporta</label>
                        <textarea
                          id="int-reason"
                          required
                          maxLength={5000}
                          rows={3}
                          value={intReason}
                          onChange={(e) => setIntReason(e.target.value)}
                        />
                      </div>
                      <button className="btn secondary" type="submit" disabled={busy}>
                        Registrar novedad
                      </button>
                    </form>
                  </details>
                )}
              </>
            )}

            {expediente.kind === 'compensatorio' && det.ledger_entries.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Movimiento</th>
                      <th>Fecha efectiva</th>
                      <th>Minutos</th>
                      <th>Regla / expediente</th>
                      <th>Autorizó</th>
                    </tr>
                  </thead>
                  <tbody>
                    {det.ledger_entries.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.kind_display}</td>
                        <td>{FormateadorTexto.fechaCorta(entry.effective_on)}</td>
                        <td>
                          {entry.kind === 'credito' ? '+' : '−'}
                          {entry.minutes}
                        </td>
                        <td>
                          {entry.rule_reference}
                          <small>
                            <AppLink to={`/expedientes/${entry.case_id}`}>
                              {entry.case_reference}
                            </AppLink>
                          </small>
                        </td>
                        <td>{entry.actor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {det.financial_entries.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Movimiento</th>
                      <th>Fecha / referencia</th>
                      <th>Valor</th>
                      <th>Responsable</th>
                      <th>Soporte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {det.financial_entries.map((e) => (
                      <tr key={e.id}>
                        <td>{e.kind_display}</td>
                        <td>
                          {FormateadorTexto.fechaCorta(e.paid_on)}
                          <small>{e.reference}</small>
                        </td>
                        <td>{FormateadorTexto.moneda(e.amount)}</td>
                        <td>{e.actor}</td>
                        <td>
                          <a href={e.download_url}>Descargar ↓</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {det.payment_options && (
              <details className="padded">
                <summary className="text-link">＋ Registrar movimiento financiero</summary>
                <p className="help">
                  Adjunte primero su soporte en Documentos. Registre únicamente operaciones
                  efectivamente realizadas.
                </p>
                <form onSubmit={handlePaymentSubmit} aria-busy={busy}>
                  <div className="field">
                    <label htmlFor="pay-kind">Tipo de movimiento</label>
                    <select
                      id="pay-kind"
                      value={payKind}
                      onChange={(e) => setPayKind(e.target.value)}
                      required
                    >
                      {det.payment_options.kinds.map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="pay-amount">Valor (COP)</label>
                    <input
                      id="pay-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="pay-date">Fecha efectiva del movimiento</label>
                    <input
                      id="pay-date"
                      type="date"
                      required
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="pay-ref">Referencia bancaria / comprobante</label>
                    <input
                      id="pay-ref"
                      type="text"
                      maxLength={160}
                      required
                      value={payReference}
                      onChange={(e) => setPayReference(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="pay-evidence">Soporte previamente adjuntado</label>
                    <select
                      id="pay-evidence"
                      value={payEvidence}
                      onChange={(e) => setPayEvidence(e.target.value)}
                      required
                    >
                      <option value="">Seleccione un soporte</option>
                      {det.payment_options.evidences.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button className="btn primary" type="submit" disabled={busy}>
                    Registrar movimiento
                  </button>
                </form>
              </details>
            )}

            {det.can_recognize && (
              <details className="padded">
                <summary className="text-link">＋ Registrar reconocimiento adicional</summary>
                <p className="help">
                  Adjunte primero un soporte de reconocimiento actualizado. Registre el valor
                  acumulado reconocido.
                </p>
                <form onSubmit={handleRecognitionSubmit} aria-busy={busy}>
                  <div className="field">
                    <label htmlFor="recognized-val">Reconocimiento acumulado (COP)</label>
                    <input
                      id="recognized-val"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={recAmount}
                      onChange={(e) => setRecAmount(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="recognition-doc">Soporte de reconocimiento</label>
                    <select
                      id="recognition-doc"
                      required
                      value={recDocId}
                      onChange={(e) => setRecDocId(e.target.value)}
                    >
                      <option value="">Seleccione un documento</option>
                      {det.recognition_documents.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="recognition-note">Observaciones</label>
                    <textarea
                      id="recognition-note"
                      required
                      maxLength={5000}
                      rows={3}
                      value={recNote}
                      onChange={(e) => setRecNote(e.target.value)}
                    />
                  </div>
                  <button className="btn secondary" type="submit" disabled={busy}>
                    Registrar reconocimiento
                  </button>
                </form>
              </details>
            )}
          </section>

          <section className="card" id="documentos">
            <header className="card-heading">
              <div>
                <h2>
                  Documentos y soportes <span className="count">{det.documents.length}</span>
                </h2>
                <p>
                  Se conservan todas las versiones. Los certificados médicos tienen acceso
                  restringido.
                </p>
              </div>
            </header>
            {det.documents.length > 0 ? (
              <div className="document-list">
                {det.documents.map((d) => (
                  <div key={d.id} className="document">
                    <span className="file-icon">↧</span>
                    <div>
                      <strong>{d.label}</strong>
                      <small>
                        {d.name} · {FormateadorTexto.tamanoArchivo(d.size)} ·{' '}
                        {FormateadorTexto.fechaHora(d.created_at)}
                      </small>
                      <small>
                        {d.uploaded_by} · SHA-256: {d.sha256.slice(0, 12)}…
                      </small>
                    </div>
                    <a
                      className="text-link"
                      href={d.preview_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Ver ${d.name}`}
                    >
                      Ver ↗
                    </a>
                    <a
                      className="btn secondary"
                      href={d.download_url}
                      aria-label={`Descargar ${d.name}`}
                    >
                      ↓ Descargar
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty compact">
                <p>No hay documentos disponibles para su usuario.</p>
              </div>
            )}

            {det.upload_categories.length > 0 && (
              <div className="upload-area">
                <h3>Incorporar documento</h3>
                <p className="help">
                  PDF, PNG o JPG · Hasta 8 MB. Verifique el archivo antes de adjuntarlo.
                </p>
                <form onSubmit={handleUploadSubmit} aria-busy={busy}>
                  <div className="field">
                    <label htmlFor="upload-cat">Tipo de documento</label>
                    <select
                      id="upload-cat"
                      value={uploadCategory}
                      onChange={(e) => setUploadCategory(e.target.value)}
                    >
                      {det.upload_categories.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="upload-file">Archivo PDF, JPG o PNG (máximo 8 MB)</label>
                    <input
                      id="upload-file"
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      required
                    />
                  </div>
                  <button className="btn primary" type="submit" disabled={busy}>
                    ＋ Adjuntar al expediente
                  </button>
                </form>
              </div>
            )}
          </section>

          <section className="card" id="historial">
            <header className="card-heading">
              <div>
                <h2>Historial de actuaciones</h2>
                <p>
                  Responsables, decisiones, consultas y evidencias del recorrido administrativo.
                </p>
              </div>
            </header>
            {!expediente.esTerminal() && (
              <form className="padded" onSubmit={handleFollowupSubmit} aria-busy={busy}>
                <div className="field">
                  <label htmlFor="followup-note">Registrar seguimiento o comunicación</label>
                  <textarea
                    id="followup-note"
                    rows={2}
                    maxLength={5000}
                    required
                    value={followupNote}
                    onChange={(e) => setFollowupNote(e.target.value)}
                    placeholder="Describa la gestión realizada, destinatario y referencia de la comunicación."
                  />
                </div>
                <button className="btn secondary" type="submit" disabled={busy}>
                  Registrar actuación
                </button>
              </form>
            )}

            <ol className="history">
              {det.events.items.map((e) => (
                <li key={e.id}>
                  <span className="history-dot"></span>
                  <div>
                    <strong>{e.action}</strong>
                    <small>
                      {e.actor} · {FormateadorTexto.fechaHora(e.created_at)}
                    </small>
                    {(e.before || e.after) && (
                      <div className="history-states">
                        {e.before || 'Inicio'} → {e.after || '—'}
                      </div>
                    )}
                    {det.full_access && e.note && (
                      <p style={{ whiteSpace: 'pre-wrap' }}>{e.note}</p>
                    )}
                    {det.full_access && e.details && (
                      <details>
                        <summary>Ver evidencia registrada</summary>
                        <pre>{JSON.stringify(e.details, null, 2)}</pre>
                      </details>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            <div className="pagination">
              <span>
                Página {det.events.page} de {det.events.num_pages}
              </span>
              <div>
                {det.events.has_previous && (
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => void cargar(det.events.page - 1)}
                  >
                    ← Anterior
                  </button>
                )}
                {det.events.has_next && (
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => void cargar(det.events.page + 1)}
                  >
                    Siguiente →
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
