import { useCallback, useEffect, useState } from 'react';
import { AppLink } from '../components/AppLink';
import { FormateadorTexto } from '../domain/Formatters';
import type { AuditLogDTO } from '../domain/types';
import { appServices } from '../services/ServiceContainer';

interface AuditPageProps {
  onNotify: (type: 'success' | 'error' | 'warning', text: string) => void;
}

export function AuditPage({ onNotify }: AuditPageProps) {
  const [data, setData] = useState<AuditLogDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(
    async (page = 1) => {
      try {
        const res = await appServices.admin.obtenerAuditoria(page);
        setData(res);
      } catch (err) {
        onNotify('error', err instanceof Error ? err.message : 'Error consultando auditoría.');
      } finally {
        setLoading(false);
      }
    },
    [onNotify],
  );

  useEffect(() => {
    let active = true;
    appServices.admin
      .obtenerAuditoria(1)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) {
          onNotify('error', err instanceof Error ? err.message : 'Error consultando auditoría.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onNotify]);

  if (!data && loading) {
    return (
      <section className="card padded">
        <p className="muted">Cargando registro de auditoría…</p>
      </section>
    );
  }

  if (!data) return null;

  return (
    <>
      <div className="breadcrumb">
        <AppLink to="/">Inicio</AppLink>
        <span>/</span>
        Administración
      </div>
      <header className="page-heading">
        <div>
          <div className="eyebrow">TRAZABILIDAD DEL SISTEMA</div>
          <h1>Registro de auditoría</h1>
          <p>
            Accesos, actuaciones y cambios de configuración. Consulte las evidencias detalladas
            desde el expediente con el rol correspondiente.
          </p>
        </div>
      </header>
      <section className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th>Usuario</th>
                <th>Acción</th>
                <th>Expediente</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((e) => (
                <tr key={e.id}>
                  <td>{FormateadorTexto.fechaHora(e.created_at)}</td>
                  <td>{e.actor}</td>
                  <td>{e.action}</td>
                  <td>
                    {e.case_id ? (
                      <AppLink className="ref" to={`/expedientes/${e.case_id}`}>
                        {e.case_reference}
                      </AppLink>
                    ) : (
                      e.case_reference
                    )}
                  </td>
                  <td>
                    <span className={`badge ${e.result === 'rechazado' ? 'danger' : ''}`}>
                      {e.result}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <span>
            Página {data.page} de {data.num_pages}
          </span>
          <div>
            {data.has_previous && (
              <button
                type="button"
                className="btn secondary"
                onClick={() => void cargar(data.page - 1)}
              >
                ← Anterior
              </button>
            )}
            {data.has_next && (
              <button
                type="button"
                className="btn secondary"
                onClick={() => void cargar(data.page + 1)}
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
