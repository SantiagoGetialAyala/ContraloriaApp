import { useState, type FormEvent } from 'react';
import type { FlashMessage } from '../components/Layout';
import { ApiError } from '../services/HttpClient';
import { appServices } from '../services/ServiceContainer';

interface AuthPageProps {
  setupMode: boolean;
  messages: FlashMessage[];
  onAuthSuccess: (msg: string) => Promise<void>;
}

export function AuthPage({ setupMode, messages, onAuthSuccess }: AuthPageProps) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [department, setDepartment] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrors([]);
    setFieldErrors({});
    try {
      if (setupMode) {
        const msg = await appServices.auth.configurarAdministradorInicial({
          name,
          username,
          department,
          password,
          password_confirm: passwordConfirm,
        });
        await onAuthSuccess(msg);
      } else {
        const msg = await appServices.auth.iniciarSesion({ username, password });
        await onAuthSuccess(msg);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors);
        setFieldErrors(err.fieldErrors);
      } else {
        setErrors(['No fue posible procesar la solicitud.']);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main id="main">
      {messages.length > 0 && (
        <div className="auth-messages" role="status">
          {messages.map((m) => (
            <p
              key={m.id}
              className={`message ${m.type === 'error' ? 'error' : m.type === 'warning' ? 'warning' : ''}`}
            >
              {m.text}
            </p>
          ))}
        </div>
      )}
      <div className="auth-layout">
        <section className="auth-story">
          <div className="auth-brand">
            <span className="brand-mark">
              TH<span>✦</span>
            </span>
            <span>
              Contraloría Municipal
              <br />
              <strong>de Pasto</strong>
            </span>
          </div>
          <div className="auth-copy">
            <div className="eyebrow light">TALENTO HUMANO</div>
            <h1>
              Las personas,
              <br />
              en el centro
              <br />
              de la gestión.
            </h1>
            <p>
              Un espacio para tramitar incapacidades, gestionar recobros y acompañar cada comisión de
              servicio.
            </p>
            <div className="auth-features">
              <span>
                01 <strong>Procesos organizados</strong>
              </span>
              <span>
                02 <strong>Documentos protegidos</strong>
              </span>
              <span>
                03 <strong>Decisiones trazables</strong>
              </span>
            </div>
          </div>
          <div className="auth-foot">GESTIÓN PÚBLICA · RESPONSABILIDAD · TRANSPARENCIA</div>
        </section>
        <section className="auth-form-wrap">
          <div className="auth-form">
            <span className="pill">{setupMode ? 'CONFIGURACIÓN INICIAL' : 'ACCESO INSTITUCIONAL'}</span>
            <h2>{setupMode ? 'Configure su espacio institucional' : 'Bienvenido de nuevo'}</h2>
            <p className="muted">
              {setupMode
                ? 'Cree el primer administrador. Después podrá registrar los usuarios y asignar sus responsabilidades.'
                : 'Ingrese con el usuario asignado por su administrador.'}
            </p>

            {errors.length > 0 && (
              <div className="form-errors" role="alert">
                {errors.map((err, i) => (
                  <div key={i}>{err}</div>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit} aria-busy={submitting}>
              {setupMode && (
                <div className={`field ${fieldErrors.name ? 'invalid' : ''}`}>
                  <label htmlFor="auth-name">
                    Nombre completo <span className="required">*</span>
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              )}

              <div className={`field ${fieldErrors.username ? 'invalid' : ''}`}>
                <label htmlFor="auth-username">
                  {setupMode ? 'Usuario administrador' : 'Usuario'} <span className="required">*</span>
                </label>
                <input
                  id="auth-username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              {setupMode && (
                <div className={`field ${fieldErrors.department ? 'invalid' : ''}`}>
                  <label htmlFor="auth-department">
                    Dependencia <span className="required">*</span>
                  </label>
                  <input
                    id="auth-department"
                    type="text"
                    required
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                  />
                </div>
              )}

              <div className={`field ${fieldErrors.password ? 'invalid' : ''}`}>
                <label htmlFor="auth-password">
                  {setupMode ? 'Contraseña (mínimo 12 caracteres)' : 'Contraseña'}{' '}
                  <span className="required">*</span>
                </label>
                <input
                  id="auth-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {setupMode && (
                <div className={`field ${fieldErrors.password_confirm ? 'invalid' : ''}`}>
                  <label htmlFor="auth-password-confirm">
                    Repita la contraseña <span className="required">*</span>
                  </label>
                  <input
                    id="auth-password-confirm"
                    type="password"
                    required
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                  />
                </div>
              )}

              <button className="btn primary full" type="submit" disabled={submitting}>
                <span>{setupMode ? 'Crear administrador' : 'Ingresar al sistema'}</span>
                <span>→</span>
              </button>
            </form>
            <div className="auth-note">
              ▣ &nbsp; Uso exclusivo de personal autorizado.
              <br />
              <small>Los accesos y actuaciones quedan registrados.</small>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

