import { useEffect, useState } from 'react';
import { AppLink } from '../components/AppLink';
import { FormateadorTexto } from '../domain/Formatters';
import type { CalendarDTO } from '../domain/types';
import { appServices } from '../services/ServiceContainer';

interface CalendarPageProps {
  onNotify: (type: 'success' | 'error' | 'warning', text: string) => void;
}

export function CalendarPage({ onNotify }: CalendarPageProps) {
  const [data, setData] = useState<CalendarDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    appServices.expedientes
      .obtenerCalendarioCompensatorios()
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) {
          onNotify('error', err instanceof Error ? err.message : 'Error consultando el calendario.');
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
        <p className="muted">Cargando calendario de compensatorios…</p>
      </section>
    );
  }

  if (!data) return null;

  return (
    <>
      <div className="breadcrumb">
        <AppLink to="/">Inicio</AppLink>
        <span>/</span>
        <AppLink to="/modulos/compensatorio">Compensatorios</AppLink>
        <span>/</span>
        Calendario
      </div>
      <header className="page-heading">
        <div>
          <div className="eyebrow">PROGRAMACIÓN AUTORIZADA</div>
          <h1>Calendario de compensatorios</h1>
          <p>Solo aparecen solicitudes que ya generaron un débito mediante autorización expresa.</p>
        </div>
        <AppLink className="btn primary" to="/modulos/compensatorio/nuevo">
          ＋ Registrar tiempo
        </AppLink>
      </header>
      <div className="notice">
        <span className="notice-icon">i</span>
        <div>
          <strong>Sin reconocimiento automático</strong>
          <p>
            Un registro o una solicitud no modifica saldos. Los movimientos requieren una versión
            institucional habilitada y la actuación del rol autorizado.
          </p>
        </div>
      </div>
      <div className="stats-grid">
        <article className="stat">
          <div className="stat-top">
            <span>Créditos autorizados</span>
            <span className="stat-icon">＋</span>
          </div>
          <strong>{data.own_balance.credit}</strong>
          <p>minutos</p>
        </article>
        <article className="stat">
          <div className="stat-top">
            <span>Tiempo disfrutado</span>
            <span className="stat-icon blue">−</span>
          </div>
          <strong>{data.own_balance.debit}</strong>
          <p>minutos</p>
        </article>
        <article className="stat">
          <div className="stat-top">
            <span>Saldo personal</span>
            <span className="stat-icon amber">◷</span>
          </div>
          <strong>{data.own_balance.balance}</strong>
          <p>minutos disponibles</p>
        </article>
        <article className="stat">
          <div className="stat-top">
            <span>Programaciones visibles</span>
            <span className="stat-icon rose">▦</span>
          </div>
          <strong>{data.entries.length}</strong>
          <p>según sus permisos</p>
        </article>
      </div>
      <section className="card">
        <header className="card-heading">
          <div>
            <h2>Programaciones autorizadas</h2>
            <p>Vista cronológica con funcionario, periodo, tiempo y expediente de respaldo.</p>
          </div>
        </header>
        {data.entries.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th>Funcionario</th>
                  <th>Tiempo</th>
                  <th>Dependencia</th>
                  <th>Expediente</th>
                  <th>Autorizó</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      {entry.request_start_date}
                      <small>hasta {entry.request_end_date}</small>
                    </td>
                    <td>{entry.employee}</td>
                    <td>{entry.minutes} min</td>
                    <td>{entry.department}</td>
                    <td>
                      <AppLink className="ref" to={`/expedientes/${entry.case_id}`}>
                        {entry.case_reference}
                      </AppLink>
                    </td>
                    <td>
                      {entry.actor}
                      <small>{FormateadorTexto.fechaHora(entry.created_at)}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty large-empty">
            <span className="empty-icon">▦</span>
            <h3>No hay compensatorios autorizados</h3>
            <p>Las solicitudes aparecerán aquí después de la autorización y el movimiento de saldo.</p>
          </div>
        )}
      </section>
    </>
  );
}

