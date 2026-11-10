import { useEffect, useState } from 'react';
import { AppLink } from '../components/AppLink';
import type { ProceduresDTO } from '../domain/types';
import { appServices } from '../services/ServiceContainer';

interface ProcedurePageProps {
  onNotify: (type: 'success' | 'error' | 'warning', text: string) => void;
}

export function ProcedurePage({ onNotify }: ProcedurePageProps) {
  const [data, setData] = useState<ProceduresDTO | null>(null);

  useEffect(() => {
    let active = true;
    appServices.expedientes
      .obtenerProcedimientos()
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) {
          onNotify('error', err instanceof Error ? err.message : 'Error consultando procedimientos.');
        }
      });
    return () => {
      active = false;
    };
  }, [onNotify]);

  return (
    <>
      <div className="breadcrumb">
        <AppLink to="/">Inicio</AppLink>
        <span>/</span>
        Procedimientos
      </div>
      <header className="page-heading">
        <div>
          <div className="eyebrow">RUTA DE CADA EXPEDIENTE</div>
          <h1>Procedimientos y responsabilidades</h1>
          <p>Consulte las etapas, responsables propuestos y documentos exigidos.</p>
        </div>
      </header>
      {data?.modules.some((module) => !module.confirmed) && <div className="notice">
        <span className="notice-icon">i</span>
        <div>
          <strong>Matriz técnica provisional</strong>
          <p>
            Los módulos marcados como provisionales requieren revisión de sus fuentes y aprobación institucional. Consulte su versión y las responsabilidades antes de tramitar un expediente.
          </p>
        </div>
      </div>}

      {data?.modules.map((mod) => (
        <section key={mod.kind} className="card">
          <header className="card-heading">
            <h2>{mod.title}</h2>
            <span className={`badge ${mod.confirmed ? '' : 'warning'}`}>{mod.confirmed ? `Versión ${mod.version} aprobada` : 'Procedimiento provisional'} · {mod.stages.length} etapas</span>
          </header>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Etapa</th>
                  <th>Responsable propuesto</th>
                  <th>Información exigida</th>
                  <th>Evidencias para continuar</th>
                </tr>
              </thead>
              <tbody>
                {mod.stages.map((s) => (
                  <tr key={s.key}>
                    <td>
                      <strong>
                        {s.number}. {s.label}
                      </strong>
                    </td>
                    <td>{s.roles.join(', ')}</td>
                    <td>
                      {s.fields.length > 0
                        ? s.fields.map((f, idx) => (
                            <span key={idx}>
                              {f}
                              {idx < s.fields.length - 1 && <br />}
                            </span>
                          ))
                        : 'Validación de la etapa y sus condiciones de negocio'}
                    </td>
                    <td>
                      {s.docs.length > 0
                        ? s.docs.map((d, idx) => (
                            <span key={idx}>
                              {d}
                              {idx < s.docs.length - 1 && <br />}
                            </span>
                          ))
                        : 'Registro de actuación o movimientos autorizados exigidos'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="card padded">
        <h2>Cómo se protegen las decisiones</h2>
        <p>
          Cada etapa valida permisos, datos y documentos antes de avanzar. Las devoluciones exigen
          observaciones y permiten reenviar la corrección con nuevas evidencias. Los movimientos
          financieros se conservan; una recuperación posterior a la conciliación exige repetir los
          controles contables.
        </p>
        <p>
          En compensatorios, el registro de horas no crea saldo. El crédito nace únicamente cuando
          una autoridad autorizada completa la etapa de reconocimiento bajo una versión confirmada;
          el débito exige otra autorización expresa, saldo suficiente y ausencia de superposiciones.
        </p>
        <p>
          Las fechas de duración se cuentan en días calendario inclusivos. Los días liquidables se
          registran por el responsable y se validan contra la duración, la vigencia y las tarifas de
          la escala aprobada. No se calcula una prestación médica con porcentajes normativos aún no
          verificados.
        </p>
        <p>
          Las radicaciones, CDP, RP y pagos se registran con sus soportes reales. Su registro no
          significa que el sistema los haya emitido o ejecutado ante otra institución.
        </p>
      </section>
    </>
  );
}

