import { useEffect, useState, type FormEvent } from 'react';
import { AppLink } from '../components/AppLink';
import { DynamicFields } from '../components/DynamicFields';
import type { CaseKind, FieldSchemaDTO } from '../domain/types';
import { ApiError } from '../services/HttpClient';
import { appServices } from '../services/ServiceContainer';

interface CaseCreatePageProps {
  kind: CaseKind;
  onNotify: (type: 'success' | 'error' | 'warning', text: string) => void;
}

export function CaseCreatePage({ kind, onNotify }: CaseCreatePageProps) {
  const [title, setTitle] = useState('Nueva solicitud');
  const [schema, setSchema] = useState<FieldSchemaDTO[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    appServices.expedientes
      .obtenerEsquemaNuevo(kind)
      .then((res) => {
        if (!active) return;
        setTitle(res.title);
        setSchema(res.fields_schema);
        const initial: Record<string, unknown> = {};
        for (const f of res.fields_schema) {
          initial[f.key] = f.value;
        }
        setValues(initial);
        setErrors([]);
        setFieldErrors({});
      })
      .catch((err) => {
        if (!active) return;
        onNotify('error', err instanceof Error ? err.message : 'No fue posible cargar el formulario.');
      });
    return () => {
      active = false;
    };
  }, [kind, onNotify]);

  const handleFieldChange = (key: string, val: unknown) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrors([]);
    setFieldErrors({});
    try {
      const { expediente, mensaje } = await appServices.expedientes.crearBorrador(kind, values);
      onNotify('success', mensaje);
      appServices.navigation.navigate(`/expedientes/${expediente.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors);
        setFieldErrors(err.fieldErrors);
      } else {
        setErrors(['No fue posible guardar el borrador.']);
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
        {title}
      </div>
      <header className="page-heading">
        <div>
          <div className="eyebrow">GESTIÓN INSTITUCIONAL</div>
          <h1>{title}</h1>
          <p>Guarde el borrador, complete sus documentos y envíelo a revisión.</p>
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
          <DynamicFields
            schema={schema}
            values={values}
            fieldErrors={fieldErrors}
            kind={kind}
            onChange={handleFieldChange}
          />
          <div className="form-actions">
            <AppLink className="btn secondary" to={`/modulos/${kind}`}>
              Volver
            </AppLink>
            <button className="btn primary" type="submit" disabled={submitting}>
              Guardar borrador <span>→</span>
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

