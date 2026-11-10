import { LoadError } from '../components/LoadError';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AppLink } from '../components/AppLink';
import type { UsuarioSesion } from '../domain/Usuario';
import { FormateadorTexto } from '../domain/Formatters';
import type {
  EmployeeDocumentDTO,
  HojaDeVidaDetailDTO,
  HojasDeVidaDirectoryDTO,
} from '../domain/types';
import { ApiError } from '../services/HttpClient';
import { appServices } from '../services/ServiceContainer';

interface HojasDeVidaPageProps {
  selectedUserId?: number;
  usuario: UsuarioSesion;
  onNotify: (type: 'success' | 'error' | 'warning', text: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  return FormateadorTexto.fechaCorta(iso);
}

export function HojasDeVidaPage({ selectedUserId, usuario, onNotify }: HojasDeVidaPageProps) {
  // Estado vista directorio
  const [directory, setDirectory] = useState<HojasDeVidaDirectoryDTO | null>(null);
  const [detail, setDetail] = useState<HojaDeVidaDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Filtros directorio
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [empFilter, setEmpFilter] = useState('');

  // Estado detalle de persona: carga de documentos y edición de ficha
  const [docCategory, setDocCategory] = useState('hoja_vida');
  const [docTitle, setDocTitle] = useState('');
  const [docNotes, setDocNotes] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docFilterCat, setDocFilterCat] = useState('all');
  const [activeDetailTab, setActiveDetailTab] = useState<'documentos' | 'ficha'>('documentos');
  const detailFileRef = useRef<HTMLInputElement | null>(null);

  // Campos de edición de ficha en vista detalle
  const [editName, setEditName] = useState('');
  const [editDept, setEditDept] = useState('');
  const [editEmp, setEditEmp] = useState('funcionario');
  const [editCedula, setEditCedula] = useState('');
  const [editCargo, setEditCargo] = useState('');
  const [editCodigo, setEditCodigo] = useState('');
  const [editGrado, setEditGrado] = useState('');
  const [editHireDate, setEditHireDate] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editProfession, setEditProfession] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editIsJefe, setEditIsJefe] = useState(false);

  const populateEditForm = useCallback((res: HojaDeVidaDetailDTO) => {
    const p = res.person;
    setEditName(p.full_name);
    setEditDept(p.department);
    setEditEmp(p.employment);
    setEditCedula(p.cedula);
    setEditCargo(p.cargo);
    setEditCodigo(p.codigo);
    setEditGrado(p.grado);
    setEditHireDate(p.hire_date);
    setEditPhone(p.phone);
    setEditEmail(p.institutional_email);
    setEditProfession(p.profession);
    setEditBio(p.bio);
    setEditIsJefe(p.is_jefe);
  }, []);

  const cargarDetalle = useCallback(
    async (uid: number) => {
      try {
        const res = await appServices.admin.obtenerHojaDeVida(uid);
        setDetail(res);
        populateEditForm(res);
      } catch (err) {
        onNotify('error', err instanceof Error ? err.message : 'Error cargando la hoja de vida.');
      } finally {
        setLoading(false);
      }
    },
    [onNotify, populateEditForm],
  );

  useEffect(() => {
    let active = true;
    if (selectedUserId) {
      appServices.admin
        .obtenerHojaDeVida(selectedUserId)
        .then((res) => {
          if (!active) return;
          setDetail(res);
          populateEditForm(res);
        })
        .catch((err) => {
          if (active) {
            onNotify(
              'error',
              err instanceof Error ? err.message : 'Error cargando la hoja de vida.',
            );
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } else {
      appServices.admin
        .listarHojasDeVida()
        .then((res) => {
          if (!active) return;
          setDirectory(res);
        })
        .catch((err) => {
          if (active) {
            onNotify('error', err instanceof Error ? err.message : 'Error cargando hojas de vida.');
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [selectedUserId, onNotify, populateEditForm]);

  const handleUploadDocument = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    if (!docFile) {
      onNotify('warning', 'Seleccione un archivo para subir a la hoja de vida.');
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('category', docCategory);
      fd.append('title', docTitle);
      fd.append('notes', docNotes);
      fd.append('file', docFile);

      const res = await appServices.admin.subirDocumentoHojaDeVida(selectedUserId, fd);
      onNotify('success', res.message);
      setDocTitle('');
      setDocNotes('');
      setDocFile(null);
      if (detailFileRef.current) detailFileRef.current.value = '';
      await cargarDetalle(selectedUserId);
    } catch (err) {
      if (err instanceof ApiError) {
        err.errors.forEach((m) => onNotify('error', m));
      } else {
        onNotify('error', 'Error al subir el documento.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteDocument = async (doc: EmployeeDocumentDTO) => {
    if (!selectedUserId) return;
    if (!window.confirm(`¿Eliminar el documento "${doc.title}" (${doc.name})?`)) {
      return;
    }
    setBusy(true);
    try {
      const msg = await appServices.admin.eliminarDocumentoHojaDeVida(selectedUserId, doc.id);
      onNotify('success', msg);
      await cargarDetalle(selectedUserId);
    } catch (err) {
      if (err instanceof ApiError) {
        err.errors.forEach((m) => onNotify('error', m));
      } else {
        onNotify('error', 'No se pudo eliminar el documento.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSavePersonFicha = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    setBusy(true);
    try {
      const msg = await appServices.admin.actualizarHojaDeVida(selectedUserId, {
        full_name: editName,
        department: editDept,
        employment: editEmp,
        cedula: editCedula,
        cargo: editCargo,
        codigo: editCodigo,
        grado: editGrado,
        hire_date: editHireDate,
        phone: editPhone,
        institutional_email: editEmail,
        profession: editProfession,
        bio: editBio,
        is_jefe: editIsJefe,
      });
      onNotify('success', msg);
      await cargarDetalle(selectedUserId);
    } catch (err) {
      if (err instanceof ApiError) {
        err.errors.forEach((m) => onNotify('error', m));
      } else {
        onNotify('error', 'Error al guardar los datos de la persona.');
      }
    } finally {
      setBusy(false);
    }
  };

  // ============================================================================
  // VISTA DETALLE DE UNA PERSONA (/hojas-de-vida/:id)
  // ============================================================================
  if (selectedUserId) {
    if (loading && !detail) {
      return (
        <section className="card padded">
          <p className="muted">Cargando expediente de hoja de vida…</p>
        </section>
      );
    }

    if (!detail) {
      return (
        <section className="card empty large-empty">
          <h1>Persona no encontrada</h1>
          <AppLink className="btn primary" to="/hojas-de-vida">
            Volver a Hojas de vida
          </AppLink>
        </section>
      );
    }

    const { person, documents, document_categories } = detail;
    const hojasDeVida = documents.filter((d) => d.category === 'hoja_vida');
    const filteredDocs =
      docFilterCat === 'all'
        ? documents
        : documents.filter((d) => d.category === docFilterCat);

    return (
      <>
        <div className="breadcrumb">
          <AppLink to="/">Inicio</AppLink>
          <span>/</span>
          <AppLink to="/hojas-de-vida">Hojas de vida</AppLink>
          <span>/</span>
          {person.full_name}
        </div>

        <header className="page-heading">
          <div>
            <div className="eyebrow">EXPEDIENTE PERSONAL Y HOJA DE VIDA</div>
            <h1>{person.full_name}</h1>
            <p>
              <strong>@{person.username}</strong>
              {person.cedula ? ` · CC ${person.cedula}` : ''}
              {person.cargo ? ` · ${person.cargo}` : ''}
              {person.department ? ` · ${person.department}` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <AppLink className="btn secondary" to="/hojas-de-vida">
              ← Volver a personas
            </AppLink>
            {person.latest_hoja_vida && (
              <a
                className="btn primary"
                href={person.latest_hoja_vida.preview_url}
                target="_blank"
                rel="noreferrer"
              >
                Ver Hoja de Vida actual ↗
              </a>
            )}
          </div>
        </header>

        <section className="stats-grid" aria-label="Resumen del expediente de la persona">
          <article className="stat">
            <span>Vinculación</span>
            <strong>{person.employment_display}</strong>
            <small>{person.department || 'Sin dependencia'}</small>
          </article>
          <article className="stat">
            <span>Hojas de vida</span>
            <strong>{hojasDeVida.length}</strong>
            <small>
              {hojasDeVida.length > 0 ? 'Hoja de vida registrada' : 'Pendiente por subir'}
            </small>
          </article>
          <article className="stat">
            <span>Total documentos</span>
            <strong>{documents.length}</strong>
            <small>Soportes y anexos del usuario</small>
          </article>
          <article className="stat">
            <span>Ingreso / Estado</span>
            <strong>{person.hire_date ? formatDate(person.hire_date) : 'Activo'}</strong>
            <small>
              {person.profession || person.cargo || 'Funcionario institucional'}
            </small>
          </article>
        </section>

        {person.bio && (
          <section className="card padded" style={{ marginBottom: 20 }}>
            <div className="eyebrow">PERFIL PROFESIONAL / RESUMEN DE HOJA DE VIDA</div>
            <p style={{ margin: '6px 0 0', lineHeight: 1.5 }}>{person.bio}</p>
            {(person.institutional_email || person.phone || person.profession) && (
              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  flexWrap: 'wrap',
                  marginTop: 10,
                  fontSize: 13,
                  opacity: 0.85,
                }}
              >
                {person.profession && <span>🎓 {person.profession}</span>}
                {person.institutional_email && <span>✉ {person.institutional_email}</span>}
                {person.phone && <span>☎ {person.phone}</span>}
              </div>
            )}
          </section>
        )}

        {/* Pestañas de navegación interna del usuario */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button
            type="button"
            className={`btn ${activeDetailTab === 'documentos' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveDetailTab('documentos')}
          >
            ▤ Hojas de vida y documentos ({documents.length})
          </button>
          <button
            type="button"
            className={`btn ${activeDetailTab === 'ficha' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveDetailTab('ficha')}
          >
            ✎ Datos personales y laborales
          </button>
        </div>

        {activeDetailTab === 'documentos' ? (
          <div className="admin-layout">
            {/* Columna izquierda: Hojas de vida y todos los documentos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Tarjeta destacada: Hojas de Vida de la persona */}
              <section className="card">
                <header className="card-heading">
                  <div>
                    <h2>Hojas de vida de {person.full_name}</h2>
                    <p>Formatos únicos de hoja de vida y currículums cargados en este usuario.</p>
                  </div>
                  <span className="count">{hojasDeVida.length}</span>
                </header>
                {hojasDeVida.length === 0 ? (
                  <div className="card-body">
                    <p className="muted">
                      Esta persona aún no tiene un archivo de Hoja de Vida cargado. Use el
                      formulario de la derecha para subir su Hoja de Vida.
                    </p>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Hoja de vida</th>
                          <th>Archivo</th>
                          <th>Fecha</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hojasDeVida.map((hv) => (
                          <tr key={hv.id}>
                            <td>
                              <strong>{hv.title}</strong>
                              {hv.notes && <small>{hv.notes}</small>}
                            </td>
                            <td>
                              <span>{hv.name}</span>
                              <small>
                                {formatBytes(hv.size)} · Subido por {hv.uploaded_by}
                              </small>
                            </td>
                            <td>{formatDate(hv.created_at)}</td>
                            <td>
                              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <a
                                  className="text-link"
                                  href={hv.preview_url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Ver ↗
                                </a>
                                <a className="text-link" href={hv.download_url}>
                                  Descargar ↓
                                </a>
                                <button
                                  type="button"
                                  className="text-link"
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#b42318',
                                    cursor: 'pointer',
                                    padding: 0,
                                  }}
                                  onClick={() => void handleDeleteDocument(hv)}
                                >
                                  Eliminar
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Tarjeta: Todos los documentos y soportes de la persona */}
              <section className="card">
                <header className="card-heading">
                  <div>
                    <h2>Documentos y soportes de la persona</h2>
                    <p>
                      Cédula, diplomas, tarjetas profesionales, contratos, antecedentes y demás
                      anexos.
                    </p>
                  </div>
                  <span className="count">{filteredDocs.length}</span>
                </header>

                <div
                  className="card-body"
                  style={{ paddingBottom: 0, display: 'flex', gap: 10, alignItems: 'center' }}
                >
                  <label htmlFor="filter-doc-cat" style={{ fontSize: 13, fontWeight: 600 }}>
                    Filtrar por tipo:
                  </label>
                  <select
                    id="filter-doc-cat"
                    value={docFilterCat}
                    onChange={(e) => setDocFilterCat(e.target.value)}
                    style={{ maxWidth: 320 }}
                  >
                    <option value="all">Todos los documentos ({documents.length})</option>
                    {document_categories.map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                {filteredDocs.length === 0 ? (
                  <div className="card-body">
                    <p className="muted">No hay documentos registrados en esta categoría.</p>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Categoría</th>
                          <th>Título / Archivo</th>
                          <th>Fecha / Tamaño</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDocs.map((doc) => (
                          <tr key={doc.id}>
                            <td>
                              <span
                                className={`badge ${doc.category === 'hoja_vida' ? 'success' : ''}`}
                              >
                                {doc.category_label}
                              </span>
                            </td>
                            <td>
                              <strong>{doc.title}</strong>
                              <small>
                                {doc.name}
                                {doc.notes ? ` · ${doc.notes}` : ''}
                              </small>
                            </td>
                            <td>
                              <span>{formatDate(doc.created_at)}</span>
                              <small>
                                {formatBytes(doc.size)} · SHA {doc.sha256.slice(0, 8)}
                              </small>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <a
                                  className="text-link"
                                  href={doc.preview_url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Ver ↗
                                </a>
                                <a className="text-link" href={doc.download_url}>
                                  Descargar ↓
                                </a>
                                <button
                                  type="button"
                                  className="text-link"
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#b42318',
                                    cursor: 'pointer',
                                    padding: 0,
                                  }}
                                  onClick={() => void handleDeleteDocument(doc)}
                                >
                                  Eliminar
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>

            {/* Columna derecha: Formulario para subir Hoja de Vida o Documento */}
            <section className="card">
              <header className="card-heading">
                <div>
                  <h2>Subir hoja de vida o documento</h2>
                  <p>
                    Agregue la hoja de vida o cualquier soporte al expediente de{' '}
                    <strong>{person.full_name}</strong>.
                  </p>
                </div>
              </header>
              <form className="card-body" onSubmit={handleUploadDocument} aria-busy={busy}>
                <div className="field">
                  <label htmlFor="hv-doc-cat">
                    Tipo de documento <span className="required">*</span>
                  </label>
                  <select
                    id="hv-doc-cat"
                    value={docCategory}
                    onChange={(e) => setDocCategory(e.target.value)}
                  >
                    {document_categories.map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="hv-doc-title">Título o descripción del documento</label>
                  <input
                    id="hv-doc-title"
                    type="text"
                    placeholder="Ej. Hoja de vida Función Pública 2026"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="hv-doc-file">
                    Archivo (PDF, Word, JPG o PNG · máx. 10 MB) <span className="required">*</span>
                  </label>
                  <input
                    ref={detailFileRef}
                    id="hv-doc-file"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                    required
                    onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="hv-doc-notes">Observaciones (opcional)</label>
                  <textarea
                    id="hv-doc-notes"
                    rows={3}
                    placeholder="Vigencia, número de folios o notas de verificación…"
                    value={docNotes}
                    onChange={(e) => setDocNotes(e.target.value)}
                  />
                </div>

                <button className="btn primary full" type="submit" disabled={busy}>
                  Subir a la hoja de vida →
                </button>
              </form>
            </section>
          </div>
        ) : (
          /* Pestaña de edición de datos personales y laborales de la persona */
          <section className="card form-card">
            <header className="card-heading">
              <div>
                <h2>Ficha personal y laboral · {person.full_name}</h2>
                <p>Actualice los datos personales y laborales. Los accesos se gestionan en Usuarios y permisos.</p>
              </div>
            </header>
            <form className="card-body" onSubmit={handleSavePersonFicha} aria-busy={busy}>
              <div className="data-grid">
                <div className="field">
                  <label htmlFor="ed-name">
                    Nombre completo <span className="required">*</span>
                  </label>
                  <input
                    id="ed-name"
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ed-cedula">Cédula / Documento de identidad</label>
                  <input
                    id="ed-cedula"
                    type="text"
                    value={editCedula}
                    onChange={(e) => setEditCedula(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ed-dept">
                    Dependencia <span className="required">*</span>
                  </label>
                  <input
                    id="ed-dept"
                    type="text"
                    required
                    value={editDept}
                    onChange={(e) => setEditDept(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ed-emp">Vinculación</label>
                  <select
                    id="ed-emp"
                    value={editEmp}
                    onChange={(e) => setEditEmp(e.target.value)}
                  >
                    {detail.employments.map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ed-cargo">Cargo</label>
                  <input
                    id="ed-cargo"
                    type="text"
                    value={editCargo}
                    onChange={(e) => setEditCargo(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ed-profession">Profesión / Nivel educativo</label>
                  <input
                    id="ed-profession"
                    type="text"
                    placeholder="Ej. Contador Público · Especialista en Control Fiscal"
                    value={editProfession}
                    onChange={(e) => setEditProfession(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ed-codigo">Código de cargo</label>
                  <input
                    id="ed-codigo"
                    type="text"
                    value={editCodigo}
                    onChange={(e) => setEditCodigo(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ed-grado">Grado</label>
                  <input
                    id="ed-grado"
                    type="text"
                    value={editGrado}
                    onChange={(e) => setEditGrado(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ed-hire">Fecha de ingreso</label>
                  <input
                    id="ed-hire"
                    type="date"
                    value={editHireDate}
                    onChange={(e) => setEditHireDate(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ed-phone">Teléfono / Celular</label>
                  <input
                    id="ed-phone"
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ed-email">Correo electrónico institucional</label>
                  <input
                    id="ed-email"
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="ed-bio">Resumen de hoja de vida / Experiencia y estudios</label>
                <textarea
                  id="ed-bio"
                  rows={4}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                />
              </div>

              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={editIsJefe}
                    onChange={(e) => setEditIsJefe(e.target.checked)}
                  />
                  <span>Es jefe inmediato de su dependencia</span>
                </label>
              </div>

              <div className="notice compact"><div><strong>Acceso y permisos</strong><p>Los roles, la activación y las contraseñas se gestionan en Usuarios y permisos.</p>{usuario.esAdministrador() && <AppLink className="text-link" to={`/administracion/usuarios/${selectedUserId}`}>Gestionar acceso de este usuario</AppLink>}</div></div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setActiveDetailTab('documentos')}
                >
                  Cancelar
                </button>
                <button className="btn primary" type="submit" disabled={busy}>
                  Guardar cambios de la ficha →
                </button>
              </div>
            </form>
          </section>
        )}
      </>
    );
  }

  // ============================================================================
  // VISTA DIRECTORIO DE PERSONAS Y CREACIÓN (/hojas-de-vida)
  // ============================================================================
  if (loading && !directory) {
    return (
      <section className="card padded">
        <p className="muted">Cargando directorio de hojas de vida…</p>
      </section>
    );
  }

  if (!directory) return <LoadError />;

  const filteredPeople = directory.people.filter((p) => {
    const q = search.trim().toLowerCase();
    if (q) {
      const match =
        p.full_name.toLowerCase().includes(q) ||
        p.username.toLowerCase().includes(q) ||
        p.cedula.toLowerCase().includes(q) ||
        p.cargo.toLowerCase().includes(q) ||
        p.department.toLowerCase().includes(q);
      if (!match) return false;
    }
    if (deptFilter && p.department !== deptFilter) return false;
    if (empFilter && p.employment !== empFilter) return false;
    return true;
  });

  const totalWithHV = directory.people.filter((p) => p.hoja_vida_count > 0).length;
  const totalDocs = directory.people.reduce((acc, p) => acc + p.documents_count, 0);

  return (
    <>
      <div className="breadcrumb">
        <AppLink to="/">Inicio</AppLink>
        <span>/</span>
        Hojas de vida
      </div>

      <header className="page-heading">
        <div>
          <div className="eyebrow">EXPEDIENTE LABORAL Y DOCUMENTAL</div>
          <h1>Hojas de vida</h1>
          <p>
            Consulte las fichas laborales y gestione las hojas de vida y sus documentos soporte.
          </p>
        </div>
        {usuario.esAdministrador() && <AppLink className="btn primary" to="/administracion/usuarios">Registrar funcionario</AppLink>}
      </header>

      <section className="stats-grid" aria-label="Indicadores de hojas de vida">
        <article className="stat">
          <span>Personas registradas</span>
          <strong>{directory.people.length}</strong>
          <small>Funcionarios y contratistas</small>
        </article>
        <article className="stat">
          <span>Con Hoja de Vida</span>
          <strong>{totalWithHV}</strong>
          <small>de {directory.people.length} personas</small>
        </article>
        <article className="stat">
          <span>Documentos cargados</span>
          <strong>{totalDocs}</strong>
          <small>Hojas de vida y soportes</small>
        </article>
        <article className="stat">
          <span>Dependencias</span>
          <strong>{directory.dependencias.length}</strong>
          <small>Áreas con personal</small>
        </article>
      </section>

      <div className="admin-layout hv-directory">
        {/* Listado de personas y sus hojas de vida */}
        <section className="card">
          <header className="card-heading">
            <div>
              <h2>Personas registradas</h2>
              <p>Seleccione una persona para ver o subir su hoja de vida y sus documentos.</p>
            </div>
            <span className="count">{filteredPeople.length}</span>
          </header>

          {/* Barra de búsqueda y filtros */}
          <div
            className="card-body"
            style={{
              paddingBottom: 8,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 10,
            }}
          >
            <input
              type="search"
              placeholder="Buscar por nombre, usuario, cédula o cargo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
              <option value="">Todas las dependencias</option>
              {directory.dependencias.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}>
              <option value="">Toda vinculación</option>
              {directory.employments.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Persona / Usuario</th>
                  <th>Dependencia y Cargo</th>
                  <th>Hoja de vida y documentos</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredPeople.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.full_name}</strong>
                      <small>
                        @{p.username}
                        {p.cedula ? ` · CC ${p.cedula}` : ''}
                      </small>
                    </td>
                    <td>
                      <span>{p.department || '—'}</span>
                      <small>
                        {p.cargo || p.employment_display} ({p.employment_display})
                      </small>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span
                          className={`badge ${p.hoja_vida_count > 0 ? 'success' : 'warning'}`}
                        >
                          {p.hoja_vida_count > 0
                            ? `${p.hoja_vida_count} Hoja(s) de vida`
                            : 'Sin Hoja de vida'}
                        </span>
                        <span className="badge">{p.documents_count} doc(s)</span>
                      </div>
                      {p.latest_hoja_vida && (
                        <small style={{ marginTop: 4, display: 'block' }}>
                          Última: {p.latest_hoja_vida.name}
                        </small>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <AppLink className="btn primary" to={`/hojas-de-vida/${p.id}`}>
                          Abrir hoja de vida →
                        </AppLink>
                        {p.latest_hoja_vida && (
                          <a
                            className="text-link"
                            href={p.latest_hoja_vida.preview_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ver PDF ↗
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </>
  );
}
