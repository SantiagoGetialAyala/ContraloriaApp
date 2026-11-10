import { CalculadoraTramite, FormateadorTexto } from '../domain/Formatters';
import { CalendarioLaboralColombia } from '../domain/PlanVacaciones';
import type { CaseKind, FieldSchemaDTO } from '../domain/types';

const calendarioColombia = new CalendarioLaboralColombia();

interface DynamicFieldsProps {
  schema: FieldSchemaDTO[];
  values: Record<string, unknown>;
  fieldErrors?: Record<string, string[]>;
  kind?: CaseKind;
  onChange: (key: string, value: unknown) => void;
}

export function DynamicFields({
  schema,
  values,
  fieldErrors = {},
  kind,
  onChange,
}: DynamicFieldsProps) {
  const startDate = String(values.start_date || '');
  const endDate = String(values.end_date || '');
  const calculatedDays = CalculadoraTramite.calcularDiasCalendario(startDate, endDate);

  const workStart = String(values.work_start || '');
  const workEnd = String(values.work_end || '');
  const breakMins = Number(values.break_minutes || 0);
  const calculatedMinutes = CalculadoraTramite.calcularMinutosTrabajados(
    workStart,
    workEnd,
    breakMins,
  );

  const businessDaysVal = Number(values.business_days || 0);
  const showVacationPreview =
    kind === 'vacaciones' &&
    Boolean(startDate) &&
    businessDaysVal >= 1 &&
    businessDaysVal <= 15 &&
    schema.some((f) => f.key === 'business_days');
  const startIsBusinessDay =
    showVacationPreview &&
    calendarioColombia.esDiaHabil(CalendarioLaboralColombia.parseISO(startDate));
  const vacEndIso =
    showVacationPreview && startIsBusinessDay
      ? calendarioColombia.calcularFechaFinHabil(startDate, businessDaysVal)
      : '';
  const vacReturnIso = vacEndIso ? calendarioColombia.calcularSiguienteDiaHabil(vacEndIso) : '';

  return (
    <>
      {schema.map((field) => {
        const errors = fieldErrors[field.key] || [];
        const id = `field-${field.key}`;
        const rawVal = values[field.key];

        return (
          <div key={field.key} className={`field ${errors.length > 0 ? 'invalid' : ''}`}>
            {field.type === 'bool' ? (
              <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  id={id}
                  type="checkbox"
                  checked={Boolean(rawVal)}
                  onChange={(e) => onChange(field.key, e.target.checked)}
                />
                <span>{field.label}</span>
              </label>
            ) : (
              <>
                <label htmlFor={id}>{field.label}</label>
                {field.type === 'textarea' ? (
                  <textarea
                    id={id}
                    rows={3}
                    value={String(rawVal ?? '')}
                    onChange={(e) => onChange(field.key, e.target.value)}
                  />
                ) : field.type === 'choice' || field.type === 'scale' ? (
                  <select
                    id={id}
                    value={String(rawVal ?? '')}
                    onChange={(e) => onChange(field.key, e.target.value)}
                  >
                    <option value="">Seleccione una opción</option>
                    {field.choices.map(([optVal, optLabel]) => (
                      <option key={optVal} value={optVal}>
                        {optLabel}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'date' || field.type === 'pastdate' ? (
                  <input
                    id={id}
                    type="date"
                    value={String(rawVal ?? '')}
                    onChange={(e) => onChange(field.key, e.target.value)}
                  />
                ) : field.type === 'time' ? (
                  <input
                    id={id}
                    type="time"
                    value={String(rawVal ?? '')}
                    onChange={(e) => onChange(field.key, e.target.value)}
                  />
                ) : field.type === 'money' ? (
                  <input
                    id={id}
                    type="number"
                    step="0.01"
                    min="0"
                    value={String(rawVal ?? '')}
                    onChange={(e) => onChange(field.key, e.target.value)}
                  />
                ) : field.type === 'int' ? (
                  <input
                    id={id}
                    type="number"
                    step="1"
                    min="0"
                    value={String(rawVal ?? '')}
                    onChange={(e) => onChange(field.key, e.target.value)}
                  />
                ) : (
                  <input
                    id={id}
                    type="text"
                    value={String(rawVal ?? '')}
                    onChange={(e) => onChange(field.key, e.target.value)}
                  />
                )}
              </>
            )}

            {errors.length > 0 && (
              <ul className="errorlist" role="alert">
                {errors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {calculatedDays !== null && schema.some((f) => f.key === 'end_date') && (
        <div className="notice compact">
          <span className="notice-icon">i</span>
          <div>
            <strong>Duración calculada: {calculatedDays} día{calculatedDays === 1 ? '' : 's'} calendario</strong>
            {kind === 'incapacidad' && (
              <p>{CalculadoraTramite.determinarResponsablePagoIncapacidad(calculatedDays)}</p>
            )}
          </div>
        </div>
      )}

      {calculatedMinutes !== null && schema.some((f) => f.key === 'work_end') && (
        <div className="notice compact">
          <span className="notice-icon">◷</span>
          <div>
            <strong>Tiempo efectivo estimado: {calculatedMinutes} minutos</strong>
            <p>Calculado automáticamente descontando los minutos de pausa indicados.</p>
          </div>
        </div>
      )}

      {showVacationPreview && (
        <div className="notice compact">
          <span className="notice-icon">☀</span>
          <div>
            {startIsBusinessDay ? (
              <>
                <strong>
                  Disfrute estimado: del {FormateadorTexto.fechaCorta(startDate)} al{' '}
                  {FormateadorTexto.fechaCorta(vacEndIso)} ({businessDaysVal} día
                  {businessDaysVal === 1 ? '' : 's'} hábiles)
                </strong>
                <p>
                  Reintegro previsto: <strong>{FormateadorTexto.fechaCorta(vacReturnIso)}</strong>{' '}
                  (descontando sábados, domingos y festivos de Colombia).
                </p>
              </>
            ) : (
              <>
                <strong>La fecha de inicio seleccionada no es un día hábil</strong>
                <p>
                  Las vacaciones deben iniciar en un día hábil (no sábado, domingo ni festivo).
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

