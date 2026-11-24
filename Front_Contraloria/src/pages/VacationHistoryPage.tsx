import { useEffect, useState } from 'react';
import { AppLink } from '../components/AppLink';
import { LoadError } from '../components/LoadError';
import type { EventoHistorialVacacionesDTO, HistorialVacacionesDTO, PeriodoHistorialDTO } from '../domain/types';
import { ApiError } from '../services/HttpClient';
import { appServices } from '../services/ServiceContainer';

type Notify = (type: 'success' | 'error' | 'warning', text: string) => void;

/** «martes, 8 de diciembre de 2026» */
function fecha(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function dias(n: number): string {
  return `${n} ${n === 1 ? 'día hábil' : 'días hábiles'}`;
}

/** Historial de vacaciones de una persona: lo que tomó, lo que se suspendió y cuánto le queda. */
export function VacationHistoryPage({ userId, onNotify }: { userId: number; onNotify: Notify }) {
  const [data, setData] = useState<HistorialVacacionesDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    appServices.expedientes.obtenerHistorialVacaciones(userId)
      .then((res) => { if (activo) setData(res); })
      .catch((err) => {
        if (!activo) return;
        const mensaje = err instanceof ApiError ? err.errors[0] : 'No fue posible cargar el historial.';
        setError(mensaje);
        onNotify('error', mensaje);
      })
      .finally(() => { if (activo) setLoading(false); });
    return () => { activo = false; };
  }, [userId, onNotify]);

  if (loading) return <section className="card padded"><p className="muted">Cargando el historial de vacaciones…</p></section>;
  if (!data) {
    return error ? (
      <section className="card padded"><h1>No se puede mostrar el historial</h1><p>{error}</p>
        <AppLink className="btn secondary" to="/modulos/vacaciones">Volver a vacaciones</AppLink></section>
    ) : <LoadError />;
  }

  const conPendientes = data.periodos.filter((p) => p.pendientes > 0 || p.eventos.length > 0);
  const completos = data.periodos.filter((p) => !(p.pendientes > 0 || p.eventos.length > 0));

  return (
    <>
      <div className="breadcrumb">
        <AppLink to="/">Inicio</AppLink><span>/</span>
        <AppLink to="/modulos/vacaciones">Vacaciones</AppLink><span>/</span>
        Historial
      </div>
      <header className="page-heading">
        <div>
          <h1>Historial de vacaciones</h1>
          <p className="hist-person">
            <strong>{data.persona.nombre}</strong>
            {data.persona.dependencia && ` · ${data.persona.dependencia}`}
            {data.persona.cargo && ` · ${data.persona.cargo}`}
            {data.persona.ingreso && ` · Ingresó el ${fecha(data.persona.ingreso)}`}
          </p>
        </div>
      </header>

      {data.problema ? (
        <div className="notice"><div>{data.problema}</div></div>
      ) : (
        <section className="hist-total" aria-live="polite">
          <span>En total le quedan</span>
          <strong>{dias(data.pendientes_total)}</strong>
          <small>
            Cada año trabajado da 15 días hábiles. La primera salida de cada periodo es de al menos{' '}
            {data.minimo_primera_salida} días; el resto se puede tomar después, dentro del año.
          </small>
        </section>
      )}

      {conPendientes.map((p) => <PeriodoCard key={p.numero} periodo={p} />)}

      {completos.length > 0 && (
        <details className="hist-completos">
          <summary>Ver periodos sin movimientos registrados ({completos.length})</summary>
          {completos.map((p) => <PeriodoCard key={p.numero} periodo={p} />)}
        </details>
      )}
    </>
  );
}

function PeriodoCard({ periodo: p }: { periodo: PeriodoHistorialDTO }) {
  return (
    <section className="hist-periodo" aria-labelledby={`periodo-${p.numero}`}>
      <header>
        <div>
          <h2 id={`periodo-${p.numero}`}>Periodo {p.numero}</h2>
          <p>Año de servicio del {fecha(p.desde)} al {fecha(p.hasta)}</p>
        </div>
        <div className={`hist-saldo ${p.pendientes === 0 ? 'completo' : ''}`}>
          {p.prescrito ? (
            <><span className="badge danger">Prescrito</span><small>Ya no se puede disfrutar</small></>
          ) : p.pendientes === 0 ? (
            <><strong>Completo</strong><small>Tomó los {p.dias_del_periodo} días</small></>
          ) : (
            <><small>Le quedan</small><strong>{dias(p.pendientes)}</strong></>
          )}
        </div>
      </header>

      <p className="hist-resumen">
        {p.dias_del_periodo} días del periodo · ha tomado {p.tomados}
        {p.reservados > 0 && ` · ${p.reservados} en solicitudes en trámite`}
      </p>

      {p.plazo && p.pendientes > 0 && !p.prescrito && (
        <p className={`hist-plazo ${p.plazo_vencido ? 'vencido' : ''}`}>
          {p.plazo_vencido
            ? <>El plazo para tomar los días pendientes <strong>venció el {fecha(p.plazo)}</strong>.</>
            : <>Debe tomar los días pendientes <strong>antes del {fecha(p.plazo)}</strong>.</>}
        </p>
      )}

      {p.eventos.length === 0 ? (
        <p className="hist-vacio">Todavía no ha tomado vacaciones de este periodo.</p>
      ) : (
        <ol className="hist-eventos">
          {p.eventos.map((e, i) => <Evento key={`${e.tipo}-${e.case_id ?? ''}-${i}`} evento={e} />)}
        </ol>
      )}
    </section>
  );
}

function Evento({ evento: e }: { evento: EventoHistorialVacacionesDTO }) {
  const enlace = e.case_id && (
    <AppLink className="text-link" to={`/expedientes/${e.case_id}`}>Ver solicitud {e.referencia}</AppLink>
  );
  switch (e.tipo) {
    case 'carga_inicial':
      return (
        <li className="hist-evento tomado">
          <strong>Tomó {dias(e.dias)} antes de usar este sistema</strong>
          {e.nota && <span>Fuente: {e.nota}</span>}
        </li>
      );
    case 'salida':
      return (
        <li className={`hist-evento ${e.futura ? 'programado' : 'tomado'}`}>
          <strong>
            {e.suspendida
              ? `Disfrutó ${dias(e.dias)} desde el ${fecha(e.fecha)}`
              : e.futura
                ? `Vacaciones programadas de ${dias(e.dias)}`
                : e.en_curso
                  ? `Está disfrutando ${dias(e.dias)} de vacaciones`
                  : `Disfrutó ${dias(e.dias)}`}
          </strong>
          {!e.suspendida && <span>Del {fecha(e.fecha)} al {fecha(e.fecha_fin)}</span>}
          {enlace}
        </li>
      );
    case 'suspension':
      return (
        <li className="hist-evento suspendido">
          <strong>Se suspendieron sus vacaciones el {fecha(e.fecha)}: volvieron {dias(e.dias)} a su saldo</strong>
          {e.acto_numero && <span>{e.acto_numero}{e.acto_fecha ? ` del ${fecha(e.acto_fecha)}` : ''}</span>}
          {e.motivo && <span>Motivo: {e.motivo}</span>}
          {e.documento_url && (
            <a className="text-link" href={e.documento_url} target="_blank" rel="noopener">Ver la resolución</a>
          )}
        </li>
      );
    default:
      return (
        <li className="hist-evento tramite">
          <strong>Solicitud en trámite: {dias(e.dias)} desde el {fecha(e.fecha)}</strong>
          {e.etapa && <span>Etapa actual: {e.etapa}</span>}
          {enlace}
        </li>
      );
  }
}
