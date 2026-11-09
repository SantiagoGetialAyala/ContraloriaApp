import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AppLink } from '../components/AppLink';
import type { UsersDirectoryDTO } from '../domain/types';
import { ApiError } from '../services/HttpClient';
import { appServices } from '../services/ServiceContainer';

interface UsersPageProps {
  selectedUserId?: number;
  onNotify: (type: 'success' | 'error' | 'warning', text: string) => void;
}

export function UsersPage({ selectedUserId, onNotify }: UsersPageProps) {
  const [data, setData] = useState<UsersDirectoryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Estado formulario crear usuario
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [department, setDepartment] = useState('');
  const [employment, setEmployment] = useState('funcionario');
  const [cedula, setCedula] = useState('');
  const [cargo, setCargo] = useState('');
  const [codigo, setCodigo] = useState('');
  const [grado, setGrado] = useState('');
  const [hireDate, setHireDate] = useState('');
  const [isJefe, setIsJefe] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [roles, setRoles] = useState<string[]>([]);

  // Estado formulario editar usuario
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editActive, setEditActive] = useState(true);
  const [editPassword, setEditPassword] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editEmployment, setEditEmployment] = useState('funcionario');
  const [editCedula, setEditCedula] = useState('');
  const [editCargo, setEditCargo] = useState('');
  const [editCodigo, setEditCodigo] = useState('');
  const [editGrado, setEditGrado] = useState('');
  const [editHireDate, setEditHireDate] = useState('');
  const [editIsJefe, setEditIsJefe] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await appServices.admin.listarUsuarios();
      setData(res);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error consultando usuarios.');
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    let active = true;
    appServices.admin
      .listarUsuarios()
      .then((res) => {
        if (!active) return;
        setData(res);
        if (selectedUserId) {
          const found = res.users.find((u) => u.id === selectedUserId);
          if (found) {
            setEditRoles(found.roles);
            setEditActive(found.is_active);
            setEditPassword('');
            setEditDepartment(found.department);
            setEditEmployment(found.employment);
            setEditCedula(found.cedula);
            setEditCargo(found.cargo);
            setEditCodigo(found.codigo);
            setEditGrado(found.grado);
            setEditHireDate(found.hire_date);
            setEditIsJefe(found.is_jefe);
          }
        }
      })
      .catch((err) => {
        if (active) {
          onNotify('error', err instanceof Error ? err.message : 'Error consultando usuarios.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedUserId, onNotify]);

  const toggleRole = (list: string[], role: string, setter: (v: string[]) => void) => {
    if (list.includes(role)) {
      setter(list.filter((r) => r !== role));
    } else {
      setter([...list, role]);
    }
  };

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const msg = await appServices.admin.crearUsuario({
        name,
        username,
        department,
        employment,
        password,
        password_confirm: passwordConfirm,
        roles,
        cedula: cedula || undefined,
        cargo: cargo || undefined,
        codigo: codigo || undefined,
        grado: grado || undefined,
        hire_date: hireDate || undefined,
        is_jefe: isJefe,
      });
      setName('');
      setUsername('');
      setDepartment('');
      setCedula('');
      setCargo('');
      setCodigo('');
      setGrado('');
      setHireDate('');
      setIsJefe(false);
      setPassword('');
      setPasswordConfirm('');
      setRoles([]);
      onNotify('success', msg);
      await cargar();
    } catch (err) {
      if (err instanceof ApiError) {
        err.errors.forEach((m) => onNotify('error', m));
      } else {
        onNotify('error', 'No fue posible crear el usuario.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    setBusy(true);
    try {
      const msg = await appServices.admin.actualizarAccesoUsuario(selectedUserId, {
        roles: editRoles,
        active: editActive,
        password: editPassword || undefined,
        department: editDepartment,
        employment: editEmployment,
        cedula: editCedula,
        cargo: editCargo,
        codigo: editCodigo,
        grado: editGrado,
        hire_date: editHireDate || undefined,
        is_jefe: editIsJefe,
      });
      onNotify('success', msg);
      appServices.navigation.navigate('/administracion/usuarios');
    } catch (err) {
      if (err instanceof ApiError) {
        err.errors.forEach((m) => onNotify('error', m));
      } else {
        onNotify('error', 'No fue posible actualizar los permisos.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!data && loading) {
    return (
      <section className="card padded">
        <p className="muted">Cargando directorio de usuarios…</p>
      </section>
    );
  }

  if (!data) return null;

  if (selectedUserId) {
    const targetUser = data.users.find((u) => u.id === selectedUserId);
    if (!targetUser) {
      return (
        <section className="card empty large-empty">
          <h1>Usuario no encontrado</h1>
          <AppLink className="btn primary" to="/administracion/usuarios">
            Volver a usuarios
          </AppLink>
        </section>
      );
    }

    return (
      <>
        <div className="breadcrumb">
          <AppLink to="/">Inicio</AppLink>
          <span>/</span>
          <AppLink to="/administracion/usuarios">Usuarios y permisos</AppLink>
          <span>/</span>
          {targetUser.username}
        </div>
        <header className="page-heading">
          <div>
            <div className="eyebrow">GESTIÓN INSTITUCIONAL</div>
            <h1>Acceso · {targetUser.username}</h1>
            <p>
              {targetUser.full_name} · {targetUser.department}
            </p>
          </div>
        </header>
        <section className="card form-card">
          <form onSubmit={handleEditSubmit} aria-busy={busy}>
            <div className="field">
              <label>Roles autorizados</label>
              {data.available_roles.map(([roleKey, roleLabel]) => (
                <label
                  key={roleKey}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}
                >
                  <input
                    type="checkbox"
                    checked={editRoles.includes(roleKey)}
                    onChange={() => toggleRole(editRoles, roleKey, setEditRoles)}
                  />
                  <span>{roleLabel}</span>
                </label>
              ))}
            </div>
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                />
                <span>Usuario activo</span>
              </label>
            </div>
            <div className="field">
              <label htmlFor="edit-password">Nueva contraseña (opcional)</label>
              <input
                id="edit-password"
                type="password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-dept">Dependencia</label>
              <input
                id="edit-dept"
                type="text"
                value={editDepartment}
                onChange={(e) => setEditDepartment(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-emp">Vinculación</label>
              <select
                id="edit-emp"
                value={editEmployment}
                onChange={(e) => setEditEmployment(e.target.value)}
              >
                {data.employments.map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="edit-cedula">Cédula</label>
              <input
                id="edit-cedula"
                type="text"
                value={editCedula}
                onChange={(e) => setEditCedula(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-cargo">Cargo</label>
              <input
                id="edit-cargo"
                type="text"
                value={editCargo}
                onChange={(e) => setEditCargo(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-codigo">Código</label>
              <input
                id="edit-codigo"
                type="text"
                value={editCodigo}
                onChange={(e) => setEditCodigo(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-grado">Grado</label>
              <input
                id="edit-grado"
                type="text"
                value={editGrado}
                onChange={(e) => setEditGrado(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-hire">
                Fecha de ingreso (base de los periodos de vacaciones)
              </label>
              <input
                id="edit-hire"
                type="date"
                value={editHireDate}
                onChange={(e) => setEditHireDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={editIsJefe}
                  onChange={(e) => setEditIsJefe(e.target.checked)}
                />
                <span>Es jefe inmediato de su dependencia (da visto bueno a vacaciones)</span>
              </label>
            </div>
            <div className="form-actions">
              <AppLink className="btn secondary" to="/administracion/usuarios">
                Volver
              </AppLink>
              <button className="btn primary" type="submit" disabled={busy}>
                Guardar permisos <span>→</span>
              </button>
            </div>
          </form>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="breadcrumb">
        <AppLink to="/">Inicio</AppLink>
        <span>/</span>
        Administración
      </div>
      <header className="page-heading">
        <div>
          <div className="eyebrow">CONTROL DE ACCESO</div>
          <h1>Usuarios y permisos</h1>
          <p>
            Asigne responsabilidades específicas. El rol administrador no aprueba trámites por sí
            mismo.
          </p>
        </div>
      </header>
      <div className="admin-layout">
        <section className="card">
          <header className="card-heading">
            <h2>Directorio institucional</h2>
            <span className="count">{data.users.length}</span>
          </header>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Dependencia</th>
                  <th>Roles</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.full_name}</strong>
                      <small>{u.username}</small>
                    </td>
                    <td>{u.department}</td>
                    <td>
                      {u.roles.map((r) => (
                        <span key={r} className="badge" style={{ marginRight: 4 }}>
                          {r}
                        </span>
                      ))}
                    </td>
                    <td>
                      {u.is_active ? (
                        <>
                          <span className="dot green"></span> Activo
                        </>
                      ) : (
                        'Inactivo'
                      )}
                    </td>
                    <td>
                      <AppLink className="text-link" to={`/administracion/usuarios/${u.id}`}>
                        Editar acceso →
                      </AppLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <header className="card-heading">
            <div>
              <h2>Registrar usuario</h2>
              <p>Entregue las credenciales por un canal seguro.</p>
            </div>
          </header>
          <form className="card-body" onSubmit={handleCreateSubmit} aria-busy={busy}>
            <div className="field">
              <label htmlFor="u-name">
                Nombre completo <span className="required">*</span>
              </label>
              <input
                id="u-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="u-username">
                Usuario <span className="required">*</span>
              </label>
              <input
                id="u-username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="u-dept">
                Dependencia <span className="required">*</span>
              </label>
              <input
                id="u-dept"
                type="text"
                required
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="u-emp">Vinculación</label>
              <select
                id="u-emp"
                value={employment}
                onChange={(e) => setEmployment(e.target.value)}
              >
                {data.employments.map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="u-cedula">Cédula</label>
              <input
                id="u-cedula"
                type="text"
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="u-cargo">Cargo</label>
              <input
                id="u-cargo"
                type="text"
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="u-codigo">Código</label>
              <input
                id="u-codigo"
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="u-grado">Grado</label>
              <input
                id="u-grado"
                type="text"
                value={grado}
                onChange={(e) => setGrado(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="u-hire">
                Fecha de ingreso (base de los periodos de vacaciones)
              </label>
              <input
                id="u-hire"
                type="date"
                value={hireDate}
                onChange={(e) => setHireDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={isJefe}
                  onChange={(e) => setIsJefe(e.target.checked)}
                />
                <span>Es jefe inmediato de su dependencia (da visto bueno a vacaciones)</span>
              </label>
            </div>
            <div className="field">
              <label htmlFor="u-pass">
                Contraseña (mínimo 12 caracteres) <span className="required">*</span>
              </label>
              <input
                id="u-pass"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="u-pass2">
                Repita la contraseña <span className="required">*</span>
              </label>
              <input
                id="u-pass2"
                type="password"
                required
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
              />
            </div>
            <div className="field">
              <label>
                Roles autorizados <span className="required">*</span>
              </label>
              {data.available_roles.map(([roleKey, roleLabel]) => (
                <label
                  key={roleKey}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}
                >
                  <input
                    type="checkbox"
                    checked={roles.includes(roleKey)}
                    onChange={() => toggleRole(roles, roleKey, setRoles)}
                  />
                  <span>{roleLabel}</span>
                </label>
              ))}
            </div>
            <button className="btn primary full" type="submit" disabled={busy}>
              Crear usuario →
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
