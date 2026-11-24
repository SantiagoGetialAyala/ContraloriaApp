import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AppLink } from '../components/AppLink';
import { LoadError } from '../components/LoadError';
import type {
  AcuerdosTableroDTO,
  CumplimientoAcuerdoDTO,
  EstadoPuntoCodigo,
  EvidenciaSindicalDTO,
  PuntoAcuerdoDTO,
} from '../domain/types';
import type { CumplimientoPayload } from '../services/AcuerdosService';
import { ApiError } from '../services/HttpClient';
import { appServices } from '../services/ServiceContainer';

type Notify = (type: 'success' | 'error' | 'warning', text: string) => void;
type FiltroTipo = 'todos' | 'beneficio' | 'compromiso';

interface FormState {
  puntoId: number;
  editId?: number;
  beneficiarios?: number[];
}

const ESTADO_CLASE: Record<EstadoPuntoCodigo, string> = {
  al_dia: 'success',
  falta_evidencia: 'danger',
  sin_seguimiento: 'warning',
  sin_registros: '',
};

const ESTADOS_REGISTRO: Array<{ valor: CumplimientoPayload['estado']; titulo: string; ayuda: string }> = [
  { valor: 'en_tramite', titulo: 'Solicitado o en trámite', ayuda: 'Ya se pidió, pero aún no se concede.' },
  { valor: 'cumplido', titulo: 'Concedido o cumplido', ayuda: 'Ya se otorgó o la entidad ya cumplió.' },
  { valor: 'no_cumplido', titulo: 'Negado o no se cumplió', ayuda: 'No se concedió o no se pudo cumplir.' },
];

/** «Martes, 8 de diciembre de 2026» */
function fechaLarga(iso: string, conAnio = true): string {
  const texto = new Date(`${iso}T12:00:00`).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(conAnio ? { year: 'numeric' } : {}),
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function hoyIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function errores(err: unknown, notify: Notify, porDefecto: string) {
  if (err instanceof ApiError) err.errors.forEach((m) => notify('error', m));
  else notify('error', porDefecto);
}

export function AcuerdosSindicalesPage({ onNotify }: { onNotify: Notify }) {
  const [anioActual] = useState(() => new Date().getFullYear());
  const [anio, setAnio] = useState(anioActual);
  const [data, setData] = useState<AcuerdosTableroDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<FiltroTipo>('todos');
  const [soloAtencion, setSoloAtencion] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());
  const [form, setForm] = useState<FormState | null>(null);

  const cargar = useCallback(async (anioObjetivo: number) => {
    try {
      setData(await appServices.acuerdos.obtenerTablero(anioObjetivo));
    } catch (err) {
      errores(err, onNotify, 'No fue posible cargar los acuerdos sindicales.');
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    let activo = true;
    appServices.acuerdos.obtenerTablero(anio)
      .then((res) => { if (activo) setData(res); })
      .catch((err) => { if (activo) errores(err, onNotify, 'No fue posible cargar los acuerdos sindicales.'); })
      .finally(() => { if (activo) setLoading(false); });
    return () => { activo = false; };
  }, [anio, onNotify]);

  const abrirPunto = (puntoId: number, formulario?: FormState) => {
    setAbiertos((prev) => new Set(prev).add(puntoId));
    if (formulario) setForm(formulario);
    setFiltro('todos');
    setSoloAtencion(false);
    setBusqueda('');
    window.setTimeout(() => document.getElementById(`punto-${puntoId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const acuerdosFiltrados = useMemo(() => {
    if (!data) return [];
    const termino = normalizar(busqueda);
    return data.acuerdos.map((acuerdo) => ({
      ...acuerdo,
      puntos: acuerdo.puntos.filter((p) =>
        (filtro === 'todos' || p.tipo === filtro) &&
        (!soloAtencion || p.estado.codigo === 'falta_evidencia' || p.estado.codigo === 'sin_seguimiento') &&
        (!termino || normalizar(`${p.titulo} ${p.articulo} ${p.texto}`).includes(termino)),
      ),
    }));
  }, [data, filtro, soloAtencion, busqueda]);

  if (!data && loading) {
    return <section className="card padded"><p className="muted">Cargando los acuerdos sindicales…</p></section>;
  }
  if (!data) return <LoadError />;

  const totalVisibles = acuerdosFiltrados.reduce((n, a) => n + a.puntos.length, 0);
  const anios = Array.from({ length: anioActual - 2014 }, (_, i) => anioActual - i);

  return (
    <>
      <div className="breadcrumb">
        <AppLink to="/">Inicio</AppLink>
        <span>/</span>
        Acuerdos sindicales
      </div>
      <header className="page-heading acu-heading">
        <div>
          <h1>Acuerdos sindicales</h1>
          <p className="acu-intro">
            Aquí se lleva el control de lo que la Contraloría pactó con el sindicato ASDECCOL: quién recibió cada
            beneficio, qué compromisos se cumplieron y con qué documentos se prueba.
          </p>
        </div>
        <div className="field acu-year">
          <label htmlFor="acu-anio">Año del seguimiento</label>
          <select id="acu-anio" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </header>

      {!data.puede_gestionar && (
        <div className="notice acu-notice">
          <div><strong>Modo consulta.</strong> Usted puede revisar esta información. Solo Talento Humano registra los cumplimientos y sus documentos.</div>
        </div>
      )}

      <div className="stats-grid overview-stats acu-stats">
        <article className="stat">
          <div className="stat-top"><span>Al día</span></div>
          <strong>{data.resumen.al_dia}</strong>
          <p>puntos con todos sus soportes</p>
        </article>
        <article className="stat">
          <div className="stat-top"><span>Falta evidencia</span></div>
          <strong>{data.resumen.falta_evidencia}</strong>
          <p>tienen registros sin documentos</p>
        </article>
        <article className="stat">
          <div className="stat-top"><span>Sin seguimiento</span></div>
          <strong>{data.resumen.sin_seguimiento}</strong>
          <p>no tienen registro en el periodo</p>
        </article>
        <article className="stat">
          <div className="stat-top"><span>Sin registros</span></div>
          <strong>{data.resumen.sin_registros}</strong>
          <p>nadie los ha solicitado en {data.anio}</p>
        </article>
      </div>

      <div className="acu-layout">
        <div className="acu-main">
          <section className="acu-panel acu-filters" aria-label="Filtros">
            <div className="acu-segmented" role="group" aria-label="Mostrar">
              {([
                ['todos', 'Todos los puntos'],
                ['beneficio', 'Beneficios para funcionarios'],
                ['compromiso', 'Compromisos de la entidad'],
              ] as Array<[FiltroTipo, string]>).map(([valor, texto]) => (
                <button key={valor} type="button" className={filtro === valor ? 'active' : ''} aria-pressed={filtro === valor} onClick={() => setFiltro(valor)}>
                  {texto}
                </button>
              ))}
            </div>
            <div className="acu-filter-row">
              <div className="field">
                <label htmlFor="acu-buscar">Buscar un punto</label>
                <input id="acu-buscar" type="search" placeholder="Ejemplo: cumpleaños, dotación…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
              </div>
              <label className="acu-check">
                <input type="checkbox" checked={soloAtencion} onChange={(e) => setSoloAtencion(e.target.checked)} />
                Mostrar solo los que necesitan atención
              </label>
            </div>
          </section>

          {totalVisibles === 0 && (
            <p className="acu-empty">No hay puntos que coincidan con lo que eligió. Pruebe con «Todos los puntos» o borre la búsqueda.</p>
          )}

          {acuerdosFiltrados.filter((a) => a.puntos.length > 0).map((acuerdo) => (
            <section key={acuerdo.id} className="acu-panel acu-acuerdo">
              <header className="acu-acuerdo-head">
                <div>
                  <h2>{acuerdo.numero} <span className={`badge ${acuerdo.vigente ? 'success' : ''}`}>{acuerdo.vigente ? 'Vigente' : 'No vigente'}</span></h2>
                  <p>
                    Firmado el {fechaLarga(acuerdo.fecha_firma).replace(/^\w+, /, '')}
                    {acuerdo.acto_adopcion ? ` · ${acuerdo.acto_adopcion}` : ''} · {acuerdo.organizacion}
                  </p>
                </div>
              </header>
              <DocumentoAcuerdo
                acuerdoId={acuerdo.id}
                documentos={acuerdo.documentos}
                puedeGestionar={data.puede_gestionar}
                onNotify={onNotify}
                onDone={() => cargar(anio)}
              />
              <div className="acu-puntos">
                {acuerdo.puntos.map((punto) => (
                  <PuntoItem
                    key={punto.id}
                    punto={punto}
                    abierto={abiertos.has(punto.id)}
                    onToggle={(abierto) => setAbiertos((prev) => {
                      const next = new Set(prev);
                      if (abierto) next.add(punto.id);
                      else next.delete(punto.id);
                      return next;
                    })}
                    data={data}
                    form={form?.puntoId === punto.id ? form : null}
                    setForm={setForm}
                    onNotify={onNotify}
                    onDone={() => cargar(anio)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="acu-side" aria-label="Pendientes y próximos beneficios">
          <section className="acu-panel">
            <h2 className="acu-side-title">Lo que necesita atención</h2>
            {data.alertas.length === 0 ? (
              <p className="acu-muted">Todo está al día en {data.anio}.</p>
            ) : (
              <ul className="acu-list">
                {data.alertas.slice(0, 5).map((a) => (
                  <li key={a.punto_id}>
                    <span className={`badge ${ESTADO_CLASE[a.codigo]}`}>{a.codigo === 'falta_evidencia' ? 'Falta evidencia' : 'Sin seguimiento'}</span>
                    <strong>{a.titulo}</strong>
                    <small>{a.acuerdo} · {a.mensaje}</small>
                    <button type="button" className="btn secondary" onClick={() => abrirPunto(a.punto_id)}>Ver este punto</button>
                  </li>
                ))}
              </ul>
            )}
            {data.alertas.length > 5 && (
              <button
                type="button"
                className="btn primary acu-ver-todos"
                onClick={() => {
                  setFiltro('todos');
                  setBusqueda('');
                  setSoloAtencion(true);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                Ver los {data.alertas.length} pendientes en la lista
              </button>
            )}
          </section>
          <section className="acu-panel">
            <h2 className="acu-side-title">Próximos beneficios</h2>
            <p className="acu-muted">Cumpleaños y aniversarios de ingreso de los próximos 30 días.</p>
            {data.proximos.length === 0 ? (
              <p className="acu-muted">No hay beneficios próximos. Para que aparezcan, la hoja de vida debe tener la fecha de nacimiento y la de ingreso.</p>
            ) : (
              <ul className="acu-list">
                {data.proximos.map((p, i) => (
                  <li key={`${p.fecha}-${p.persona}-${i}`}>
                    <span className="acu-date">{fechaLarga(p.fecha, false)}</span>
                    <span>{p.mensaje}</span>
                    {data.puede_gestionar && p.punto_id && (
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => {
                          const persona = data.funcionarios.find((f) => f.nombre === p.persona);
                          abrirPunto(p.punto_id as number, { puntoId: p.punto_id as number, beneficiarios: persona ? [persona.id] : [] });
                        }}
                      >
                        Registrar este beneficio
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

function PuntoItem({
  punto, abierto, onToggle, data, form, setForm, onNotify, onDone,
}: {
  punto: PuntoAcuerdoDTO;
  abierto: boolean;
  onToggle: (abierto: boolean) => void;
  data: AcuerdosTableroDTO;
  form: FormState | null;
  setForm: (f: FormState | null) => void;
  onNotify: Notify;
  onDone: () => Promise<void>;
}) {
  const esBeneficio = punto.tipo === 'beneficio';
  const editando = form?.editId ? punto.cumplimientos.find((c) => c.id === form.editId) : undefined;
  return (
    <details id={`punto-${punto.id}`} className="acu-punto" open={abierto} onToggle={(e) => onToggle(e.currentTarget.open)}>
      <summary>
        <span className={`badge ${ESTADO_CLASE[punto.estado.codigo]}`}>{punto.estado.etiqueta}</span>
        <span className="acu-punto-title">
          <strong>{punto.titulo}</strong>
          <small>{punto.articulo} · {punto.tipo_label}</small>
        </span>
        <span className="acu-punto-count">
          {punto.cumplimientos.length} registro{punto.cumplimientos.length === 1 ? '' : 's'}
        </span>
      </summary>
      <div className="acu-punto-body">
        <p className="acu-estado-detalle">{punto.estado.detalle}</p>
        <h4>Qué dice el acuerdo</h4>
        <blockquote>{punto.texto}</blockquote>
        <p className="acu-requisitos">
          <strong>Documentos que prueban el cumplimiento:</strong>{' '}
          {punto.evidencias_requeridas.map((e) => e.label).join(', ')}.
          {' '}<span className="acu-muted">({punto.periodicidad_label})</span>
        </p>

        <h4>Registros de {data.anio}</h4>
        {punto.cumplimientos.length === 0 && <p className="acu-muted">Todavía no hay registros este año.</p>}
        {punto.cumplimientos.map((c) => (
          <RegistroItem
            key={c.id}
            registro={c}
            punto={punto}
            puedeGestionar={data.puede_gestionar}
            onEditar={() => setForm({ puntoId: punto.id, editId: c.id })}
            onNotify={onNotify}
            onDone={onDone}
          />
        ))}

        {data.puede_gestionar && (form ? (
          <CumplimientoForm
            key={`${form.editId ?? 'nuevo'}-${(form.beneficiarios ?? []).join(',')}`}
            punto={punto}
            funcionarios={data.funcionarios}
            registro={editando}
            beneficiariosIniciales={form.beneficiarios}
            onCancel={() => setForm(null)}
            onNotify={onNotify}
            onSaved={async () => {
              setForm(null);
              await onDone();
            }}
          />
        ) : (
          <button type="button" className="btn primary acu-add" onClick={() => setForm({ puntoId: punto.id })}>
            {esBeneficio ? '+ Registrar un beneficio concedido o solicitado' : '+ Registrar el cumplimiento de este compromiso'}
          </button>
        ))}
      </div>
    </details>
  );
}

function RegistroItem({
  registro, punto, puedeGestionar, onEditar, onNotify, onDone,
}: {
  registro: CumplimientoAcuerdoDTO;
  punto: PuntoAcuerdoDTO;
  puedeGestionar: boolean;
  onEditar: () => void;
  onNotify: Notify;
  onDone: () => Promise<void>;
}) {
  const cargados = new Set(registro.evidencias.map((e) => e.tipo));
  return (
    <article className="acu-registro">
      <header>
        <strong>{fechaLarga(registro.fecha)}</strong>
        <span className={`badge ${registro.estado === 'cumplido' ? 'success' : registro.estado === 'no_cumplido' ? '' : 'info'}`}>{registro.estado_label}</span>
      </header>
      {registro.beneficiarios.length > 0 && (
        <p><strong>Para:</strong> {registro.beneficiarios.map((b) => b.nombre).join(', ')}</p>
      )}
      <p>{registro.descripcion}</p>
      <ul className="acu-checklist" aria-label="Documentos del registro">
        {punto.evidencias_requeridas.map((req) => (
          <li key={req.codigo} className={cargados.has(req.codigo) ? 'ok' : registro.faltantes.some((f) => f.codigo === req.codigo) ? 'missing' : 'optional'}>
            <span aria-hidden="true">{cargados.has(req.codigo) ? '✓' : '✗'}</span>
            {req.label}: {cargados.has(req.codigo) ? 'adjunto' : registro.faltantes.some((f) => f.codigo === req.codigo) ? 'falta' : 'todavía no se exige'}
          </li>
        ))}
      </ul>
      {registro.evidencias.length > 0 && <ListaEvidencias evidencias={registro.evidencias} />}
      {puedeGestionar && (
        <div className="acu-registro-actions">
          <AdjuntarEvidencia
            opciones={[...punto.evidencias_requeridas, { codigo: 'otro', label: 'Otro soporte' }]}
            sugerido={registro.faltantes[0]?.codigo}
            onSubir={(tipo, archivo, etiqueta) => appServices.acuerdos.adjuntarEvidencia(registro.id, tipo, archivo, etiqueta)}
            onNotify={onNotify}
            onDone={onDone}
          />
          <button type="button" className="btn secondary" onClick={onEditar}>Corregir este registro</button>
        </div>
      )}
      <small className="acu-muted">Registrado por {registro.created_by}.</small>
    </article>
  );
}

function ListaEvidencias({ evidencias }: { evidencias: EvidenciaSindicalDTO[] }) {
  return (
    <ul className="acu-evidencias">
      {evidencias.map((ev) => (
        <li key={ev.id}>
          <span><strong>{ev.tipo_label}</strong> · {ev.titulo}</span>
          <span className="acu-evidencia-links">
            <a className="text-link" href={ev.preview_url} target="_blank" rel="noopener">Ver</a>
            <a className="text-link" href={ev.download_url}>Descargar</a>
          </span>
        </li>
      ))}
    </ul>
  );
}

function AdjuntarEvidencia({
  opciones, sugerido, onSubir, onNotify, onDone,
}: {
  opciones: Array<{ codigo: string; label: string }>;
  sugerido?: string;
  onSubir: (tipo: string, archivo: File, etiqueta: string) => Promise<string>;
  onNotify: Notify;
  onDone: () => Promise<void>;
}) {
  const [tipo, setTipo] = useState(sugerido || opciones[0]?.codigo || 'otro');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const etiqueta = opciones.find((o) => o.codigo === tipo)?.label ?? 'Documento';

  const subir = async (e: FormEvent) => {
    e.preventDefault();
    if (!archivo) {
      onNotify('warning', 'Primero elija el archivo que quiere adjuntar.');
      return;
    }
    if (!window.confirm(`¿Adjuntar «${archivo.name}» como «${etiqueta}»?\n\nLos documentos adjuntos no se pueden borrar después.`)) return;
    setBusy(true);
    try {
      onNotify('success', await onSubir(tipo, archivo, ''));
      setArchivo(null);
      await onDone();
    } catch (err) {
      errores(err, onNotify, 'No fue posible adjuntar el documento.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="acu-upload" onSubmit={subir} aria-busy={busy}>
      <div className="field">
        <label>Qué documento va a adjuntar
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {opciones.map((o) => <option key={o.codigo} value={o.codigo}>{o.label}</option>)}
          </select>
        </label>
      </div>
      <div className="field">
        <label>Archivo (PDF, JPG o PNG)
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      <button type="submit" className="btn secondary" disabled={busy}>Adjuntar documento</button>
    </form>
  );
}

function DocumentoAcuerdo({
  acuerdoId, documentos, puedeGestionar, onNotify, onDone,
}: {
  acuerdoId: number;
  documentos: EvidenciaSindicalDTO[];
  puedeGestionar: boolean;
  onNotify: Notify;
  onDone: () => Promise<void>;
}) {
  return (
    <div className="acu-documento">
      {documentos.length > 0 ? (
        <ListaEvidencias evidencias={documentos} />
      ) : (
        <p className="acu-muted">Aún no se ha adjuntado el documento firmado de este acuerdo.</p>
      )}
      {puedeGestionar && (
        <details className="acu-disclosure">
          <summary>{documentos.length ? 'Adjuntar otro documento del acuerdo' : 'Adjuntar el documento firmado'}</summary>
          <AdjuntarEvidencia
            opciones={[{ codigo: 'acuerdo_firmado', label: 'Documento firmado del acuerdo' }, { codigo: 'otro', label: 'Otro soporte' }]}
            onSubir={(_tipo, archivo, etiqueta) => appServices.acuerdos.adjuntarDocumentoAcuerdo(acuerdoId, archivo, etiqueta)}
            onNotify={onNotify}
            onDone={onDone}
          />
        </details>
      )}
    </div>
  );
}

function CumplimientoForm({
  punto, funcionarios, registro, beneficiariosIniciales, onCancel, onNotify, onSaved,
}: {
  punto: PuntoAcuerdoDTO;
  funcionarios: AcuerdosTableroDTO['funcionarios'];
  registro?: CumplimientoAcuerdoDTO;
  beneficiariosIniciales?: number[];
  onCancel: () => void;
  onNotify: Notify;
  onSaved: () => Promise<void>;
}) {
  const esBeneficio = punto.tipo === 'beneficio';
  const [fecha, setFecha] = useState(registro?.fecha ?? hoyIso());
  const [estado, setEstado] = useState<CumplimientoPayload['estado']>(registro?.estado ?? 'cumplido');
  const [descripcion, setDescripcion] = useState(registro?.descripcion ?? '');
  const [elegidos, setElegidos] = useState<Set<number>>(new Set(registro?.beneficiarios.map((b) => b.id) ?? beneficiariosIniciales ?? []));
  const [buscar, setBuscar] = useState('');
  const [busy, setBusy] = useState(false);
  const termino = normalizar(buscar);
  const visibles = funcionarios.filter((f) => !termino || normalizar(`${f.nombre} ${f.dependencia}`).includes(termino));

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (esBeneficio && elegidos.size === 0) {
      onNotify('warning', 'Marque a qué funcionario o funcionarios corresponde este beneficio.');
      return;
    }
    setBusy(true);
    const payload: CumplimientoPayload = { estado, fecha, descripcion, beneficiarios: [...elegidos] };
    try {
      const msg = registro
        ? await appServices.acuerdos.actualizarCumplimiento(registro.id, payload)
        : await appServices.acuerdos.crearCumplimiento({ ...payload, punto_id: punto.id });
      onNotify('success', msg);
      await onSaved();
    } catch (err) {
      errores(err, onNotify, 'No fue posible guardar el registro.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="acu-form" onSubmit={guardar} aria-busy={busy}>
      <h4>{registro ? 'Corregir el registro' : esBeneficio ? 'Registrar un beneficio' : 'Registrar el cumplimiento'}</h4>
      <fieldset className="acu-radios">
        <legend>¿En qué estado está?</legend>
        {ESTADOS_REGISTRO.map((op) => (
          <label key={op.valor} className={estado === op.valor ? 'checked' : ''}>
            <input type="radio" name={`estado-${punto.id}`} value={op.valor} checked={estado === op.valor} onChange={() => setEstado(op.valor)} />
            <span><strong>{op.titulo}</strong><small>{op.ayuda}</small></span>
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor={`fecha-${punto.id}`}>Fecha</label>
        <input id={`fecha-${punto.id}`} type="date" required max={hoyIso()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </div>
      {esBeneficio && (
        <fieldset className="acu-people">
          <legend>¿A quién? <span className="acu-muted">({elegidos.size} marcado{elegidos.size === 1 ? '' : 's'})</span></legend>
          <input type="search" aria-label="Buscar funcionario" placeholder="Buscar por nombre…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          <div className="acu-people-list">
            {visibles.map((f) => (
              <label key={f.id}>
                <input
                  type="checkbox"
                  checked={elegidos.has(f.id)}
                  onChange={(e) => setElegidos((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(f.id);
                    else next.delete(f.id);
                    return next;
                  })}
                />
                {f.nombre} <small>({f.dependencia})</small>
              </label>
            ))}
            {visibles.length === 0 && <p className="acu-muted">Nadie coincide con «{buscar}».</p>}
          </div>
          <small className="acu-muted">Solo aparecen servidores públicos: los acuerdos no aplican a contratistas.</small>
        </fieldset>
      )}
      <div className="field">
        <label htmlFor={`desc-${punto.id}`}>Descripción</label>
        <textarea
          id={`desc-${punto.id}`}
          rows={3}
          required
          placeholder={esBeneficio ? 'Ejemplo: Día de descanso por cumpleaños, disfrutado el 3 de diciembre.' : 'Ejemplo: Entrega de dotación del primer semestre.'}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
      </div>
      <p className="acu-muted">Después de guardar podrá adjuntar los documentos de prueba.</p>
      <div className="acu-form-actions">
        <button type="button" className="btn secondary" onClick={onCancel} disabled={busy}>Cancelar</button>
        <button type="submit" className="btn primary" disabled={busy}>{registro ? 'Guardar corrección' : 'Guardar registro'}</button>
      </div>
    </form>
  );
}
