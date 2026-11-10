# Vacaciones · Guía para el frontend

Escrita para quien construya o mejore las pantallas del módulo de vacaciones. La lógica de negocio ya está en el backend (ver [vacaciones.md](vacaciones.md)). Aquí se describe lo que el frontend recibe, lo que debe enviar y lo que falta por construir.

## 1. Cómo funciona el frontend en este proyecto

- **No hay API REST ni framework de JavaScript.** Cada página es una plantilla de Django que el servidor arma con los datos ya calculados (`core/templates/core/*.html`). El navegador envía formularios HTML con `POST` y el servidor responde con una redirección y un mensaje.
- **Estilos:** un solo archivo, `core/static/core/app.css`. **JavaScript:** `core/static/core/app.js` (confirmaciones, menú móvil y estado de envío).
- **Política de seguridad (CSP):** solo se permiten scripts y estilos servidos por la propia aplicación.
  - No funcionan `<script>` en línea, `style="..."`, `onclick="..."` ni librerías desde un CDN.
  - Todo va en `app.css` o `app.js`, o en archivos nuevos dentro de `core/static/core/`.
  - Si se necesita una librería (por ejemplo, para un calendario), se descarga y se sirve desde `static/`. Coordinar antes con el equipo.
- **Confirmaciones:** un botón con `data-confirm="¿Seguro…?"` muestra un diálogo antes de enviar. No hace falta JavaScript adicional.
- **Formato de las plantillas:** muchas están escritas en una sola línea. Si van a modificar una sección, conviene reformatearla primero en un commit aparte, para que la revisión sea legible.

### Reglas de todo formulario

| Elemento | Para qué sirve |
| --- | --- |
| `{% csrf_token %}` | Obligatorio en todo `POST`. Sin él, el servidor responde 403. |
| `<input type="hidden" name="revision" value="{{ case.revision }}">` | Control de concurrencia. Si otra persona modificó el expediente, el servidor rechaza el cambio y pide recargar. |
| `name="action"` con `advance`, `return`, `reject` o `note` | Decide qué hace `/expedientes/<id>/actuar/`. |
| `{% include 'core/fields.html' with form=... %}` | Dibuja los campos con etiquetas, ayudas y errores. Úsenlo para mantener un estilo uniforme. |

Los mensajes de éxito o error llegan por el sistema de mensajes de Django y ya se muestran en `base.html`.

## 2. Rutas del módulo

| Ruta | Método | Qué hace |
| --- | --- | --- |
| `/modulos/vacaciones/` | GET | Lista con filtros (`q`, `state`, `from`, `until`) y paginación |
| `/modulos/vacaciones/nuevo/` | GET / POST | Nueva solicitud: `start_date`, `business_days`, `observations` |
| `/modulos/vacaciones/reporte/` | GET | CSV con los mismos filtros de la lista |
| `/expedientes/<id>/` | GET | Detalle del expediente |
| `/expedientes/<id>/guardar/` | POST | Guarda los campos de la etapa actual |
| `/expedientes/<id>/actuar/` | POST | Avanzar, devolver, rechazar o registrar seguimiento |
| `/expedientes/<id>/documentos/` | POST (multipart) | Adjuntar un documento (`category`, `file`) |
| `/expedientes/<id>/novedad-vacaciones/` | POST | Suspensión o aplazamiento (`kind`, `on_date`, `reason`, `document_id`) |
| `/administracion/usuarios/` y `/administracion/usuarios/<id>/` | GET / POST | Datos laborales: cédula, cargo, código, grado, fecha de ingreso, dependencia, "es jefe" |

## 3. Etapas y estados

| Clave (`case.stage`) | Etiqueta | Quién actúa | Qué debe mostrar la pantalla |
| --- | --- | --- | --- |
| `borrador` | Solicitud de vacaciones | Funcionario | Fecha de inicio, días hábiles; resultado calculado al guardar |
| `visto_bueno` | Visto bueno del jefe inmediato | Jefe de la dependencia (o la autoridad si el solicitante es jefe) | Campo `jefe_note`; botones Completar o Devolver |
| `revision` | Verificación de saldo y cruces | Talento Humano | Campo `review_note`; saldos por periodo; botones Completar, Devolver o Rechazar |
| `autorizacion` | Resolución de vacaciones | Autoridad | `resolution_number`, `resolution_date` y documento `acto_firmado` obligatorio |
| `disfrute` | Disfrute y reintegro | Talento Humano | `actual_return_date`; formulario de suspensión o aplazamiento |
| `correccion` | Corrección · (etapa anterior) | Responsable de la etapa anterior | Observaciones de la devolución (`case.correction_fields`) |
| `cerrado` / `rechazado` | — | Nadie | Solo lectura |

## 4. Datos disponibles en el detalle (`/expedientes/<id>/`)

### `case.data` (valores calculados por el servidor)

| Clave | Ejemplo | Nota |
| --- | --- | --- |
| `start_date` | `"2026-12-09"` | Fecha ISO |
| `business_days` | `5` | Entre 1 y 15 |
| `end_date` | `"2026-12-15"` | Último día de disfrute, con festivos descontados |
| `return_date` | `"2026-12-16"` | Primer día hábil de regreso |
| `days` | `7` | Días calendario |
| `period_id` / `period_label` | `"Periodo 1 (15/09/2023 a 14/09/2024)"` | Periodo de causación asignado |
| `jefe_note`, `review_note` | texto | Observaciones de cada etapa |
| `resolution_number`, `resolution_date` | texto / fecha | Resolución |
| `actual_return_date` | fecha | Reintegro efectivo |
| `interruption_kind` | `"suspension"` o `"aplazamiento"` | Solo si hubo novedad |
| `interruption_date`, `interruption_reason`, `enjoyed_days`, `returned_days` | | Solo si hubo novedad |

### Otras variables de la plantilla

| Variable | Contenido |
| --- | --- |
| `step` | Etapa actual: `key`, `label`, `role_labels`, `fields`, `docs` |
| `steps` | Lista de etapas con `done` y `current` (para la barra de avance) |
| `can_edit`, `can_return` | Si el usuario puede actuar o devolver en esta etapa |
| `data_form`, `upload_form`, `decision_form` | Formularios listos para `fields.html` |
| `vacation.periods` | Lista con `period.label`, `balance`, `reserved`, `prescribes_on` y `prescribed` |
| `vacation.entries` | Movimientos de días: `get_kind_display`, `days`, `effective_on`, `period.label`, `actor` |
| `vacation.problem` | Texto si no se pueden calcular periodos (por ejemplo, falta la fecha de ingreso) |
| `vacation.interruption_form` | Formulario de novedad, o `None` si el usuario no puede registrarla |
| `documents`, `events` | Documentos visibles para el usuario e historial paginado |

### Alertas del panel (`/`)

`alerts` es una lista de diccionarios `{'case': Case o None, 'label': str, 'date': date}`. Las alertas de periodos acumulados o por prescribir **no tienen expediente** (`case` es `None`), así que no se pueden enlazar. Las de vacaciones van primero, y el panel muestra máximo 8.

## 5. Clases CSS que ya existen

`card`, `card-heading`, `card-body`, `padded`, `notice`, `notice compact`, `message success|error|warning`, `badge`, `badge success|warning|danger`, `btn primary|secondary|danger-button`, `table-wrap`, `data-grid`, `financial-grid`, `stats-grid` / `stat`, `field`, `form-actions`, `empty`, `text-link`, `breadcrumb`, `page-heading`, `eyebrow`. Revisen `app.css` antes de crear clases nuevas.

## 6. Pantallas pendientes

Para que backend y frontend avancen en paralelo, cada pantalla incluye el **contrato de datos propuesto**. Se debe acordar con el backend antes de implementarlo.

### 6.1 Calendario mensual de vacaciones (prioridad alta)

- **Ruta propuesta:** `GET /vacaciones/calendario/?mes=2026-12&dependencia=<id>`
- **Quién lo ve:**
  - Talento Humano y la autoridad: todas las dependencias.
  - Jefe: su dependencia.
  - Funcionario: sus propias vacaciones.
- **Contexto propuesto:**

```python
{
  'month': date(2026, 12, 1), 'prev_month': '2026-11', 'next_month': '2027-01',
  'dependencias': [{'id': 1, 'name': 'Control Fiscal'}], 'selected': 1,
  'weeks': [[  # lunes a domingo
      {'date': date(2026, 12, 8), 'in_month': True, 'weekend': False,
       'holiday': 'La Inmaculada Concepción',
       'absences': [{'case_id': '…', 'reference': 'VAC-1A2B3C4D', 'employee': 'Ana Servidora',
                     'status': 'concedida'}]}  # concedida | en_tramite | suspendida
  ]],
  'conflicts': [{'date': date(2026, 12, 29), 'dependencia': 'Control Fiscal', 'count': 3}],
}
```

- **Diseño:**
  - Cuadrícula de lunes a domingo.
  - Festivos y fines de semana sombreados.
  - Un color por estado, y siempre con texto: no depender solo del color.
  - Leyenda.
  - En el celular, cambiar a una lista por día.
- **Interacción:** al hacer clic en una ausencia se abre su expediente.

### 6.2 Plan anual por dependencia (prioridad alta)

Reemplaza cada hoja del Excel. La usan el jefe o Talento Humano para programar a varias personas de su área.

- Una tabla con una fila por funcionario: nombre, cargo, periodo pendiente, saldo, fecha de inicio, días hábiles, fin calculado y estado.
- Requiere nuevo trabajo de backend: crear solicitudes en nombre de otra persona.
- Contrato por definir con el backend.

### 6.3 Festivos (prioridad media)

Lista por año con opción de agregar o corregir un festivo (solo Talento Humano). Mientras tanto se cargan con `python manage.py cargar_festivos <año>`.

### 6.4 Saldos iniciales (prioridad media)

Formulario de Talento Humano: funcionario, número de periodo, días ya disfrutados y fuente. El backend ya existe (`services.register_initial_vacation_days`); falta la vista y la pantalla.

### 6.5 Mejoras al detalle (prioridad baja)

- Mostrar la línea de tiempo: inicio → fin → reintegro.
- Destacar el saldo del periodo asignado.
- Formato imprimible del Excel actual para firma (vista con estilos de impresión en `app.css`, `@media print`).

## 7. Cómo probar

```powershell
cd ContraloriaApp
$env:TALENTO_DATA_DIR = "$PWD\var-demo"
.venv\Scripts\python manage.py migrate
.venv\Scripts\python manage.py demo_vacaciones
.venv\Scripts\python manage.py runserver 127.0.0.1:8000
```

Todos los usuarios de demostración usan la contraseña `Demo-vacaciones-2026`.

| Usuario | Para probar |
| --- | --- |
| `ana` | Funcionaria con 5 días pendientes del periodo 1 (el sistema obliga a usarlos primero) |
| `bruno` | Tiene una solicitud esperando el visto bueno |
| `jefe.fiscal` | Jefa de Control Fiscal: da el visto bueno a Ana y Bruno |
| `jefe.archivo` | Jefe de otra área: no ve las solicitudes de Control Fiscal |
| `carla` | Vacaciones concedidas que inician pronto (genera recordatorios) |
| `talento` | Verificación, suspensión y aplazamiento, recordatorios, reportes |
| `autoridad` | Resolución y concesión |
| `contratista` | No puede solicitar vacaciones |
| `admin` | Usuarios y datos laborales |

Para empezar de cero, borren la carpeta `var-demo` y repitan los comandos. **No ejecuten `demo_vacaciones` sin `TALENTO_DATA_DIR`**: el comando lo impide para proteger la base real.
