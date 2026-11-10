import { useState, type FormEvent } from 'react';
import { AppLink } from '../components/AppLink';
import { ApiError } from '../services/HttpClient';
import { appServices } from '../services/ServiceContainer';

interface PasswordPageProps {
  onNotify: (type: 'success' | 'error' | 'warning', text: string) => void;
}

export function PasswordPage({ onNotify }: PasswordPageProps) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword1, setNewPassword1] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrors([]);
    setFieldErrors({});
    try {
      const msg = await appServices.auth.cambiarClave({
        old_password: oldPassword,
        new_password1: newPassword1,
        new_password2: newPassword2,
      });
      onNotify('success', msg);
      appServices.navigation.navigate('/');
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors);
        setFieldErrors(err.fieldErrors);
      } else {
        setErrors(['No fue posible actualizar la contraseña.']);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="breadcrumb">
        <AppLink to="/">Inicio</AppLink>
        <span>/</span>
        Cambiar contraseña
      </div>
      <header className="page-heading">
        <div>
          <div className="eyebrow">GESTIÓN INSTITUCIONAL</div>
          <h1>Cambiar contraseña</h1>
          <p>Complete la información para registrar la actuación.</p>
        </div>
      </header>
      <section className="card form-card">
        {errors.length > 0 && (
          <div className="form-errors" role="alert">
            {errors.map((err, i) => (
              <div key={i}>{err}</div>
            ))}
          </div>
        )}
        <form onSubmit={handleSubmit} aria-busy={submitting}>
          <div className={`field ${fieldErrors.old_password ? 'invalid' : ''}`}>
            <label htmlFor="old_password">
              Contraseña antigua <span className="required">*</span>
            </label>
            <input
              id="old_password"
              name="old_password"
              autoComplete="current-password"
              type="password"
              required
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
            />
          </div>
          <div className={`field ${fieldErrors.new_password1 ? 'invalid' : ''}`}>
            <label htmlFor="new_password1">
              Contraseña nueva (mínimo 12 caracteres) <span className="required">*</span>
            </label>
            <input
              id="new_password1"
              name="new_password1"
              autoComplete="new-password"
              minLength={12}
              type="password"
              required
              value={newPassword1}
              onChange={(e) => setNewPassword1(e.target.value)}
            />
          </div>
          <div className={`field ${fieldErrors.new_password2 ? 'invalid' : ''}`}>
            <label htmlFor="new_password2">
              Confirmación de contraseña nueva <span className="required">*</span>
            </label>
            <input
              id="new_password2"
              name="new_password2"
              autoComplete="new-password"
              minLength={12}
              type="password"
              required
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.target.value)}
            />
          </div>
          <div className="form-actions">
            <AppLink className="btn secondary" to="/">
              Volver
            </AppLink>
            <button className="btn primary" type="submit" disabled={submitting}>
              Actualizar contraseña <span>→</span>
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

