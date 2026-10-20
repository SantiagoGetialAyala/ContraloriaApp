# Entrega y verificación

Fecha: 19 de octubre de 2026.

## Resultado

Se construyó desde cero una aplicación local de Talento Humano con Django 6.0.4 y SQLite. Los dos módulos tienen formularios conectados al backend, persistencia y estados controlados. No se encontró código previo que conservar. No se insertaron datos de demostración en la base de uso.

La implementación es operativa para validación funcional local. La validación institucional de las resoluciones sigue pendiente; no se declara cumplimiento normativo ni instalación productiva.

## Archivos entregados

- `manage.py`, `requirements.txt`, `iniciar.command`, `.gitignore` y `README.md`: dependencias, ejecución e instrucciones.
- `talento/`: configuración y rutas de la aplicación.
- `core/models.py`, `core/migrations/0001_initial.py`: esquema, relaciones y restricciones.
- `core/workflows.py`, `core/services.py`, `core/access.py`, `core/forms.py`, `core/views.py`: flujos, transacciones, validación, acceso y consultas.
- `core/context.py`, `core/middleware.py`, `core/templatetags/`: navegación, seguridad de respuestas y formato de importes.
- `core/templates/core/`, `core/static/core/`: interfaz, formularios, tablas, navegación y confirmaciones.
- `core/management/commands/`: alta inicial por consola y copia consistente de SQLite.
- `tests/test_workflows.py`: pruebas automatizadas.
- `docs/`: auditoría inicial, arquitectura, matriz Markdown/CSV y esta entrega.

## Funcionalidades implementadas

Ambos módulos: borradores, envío a revisión, campos por etapa, permisos del servidor, responsables visibles, devolución documentada, corrección, reenvío, rechazo inicial, historial, documentos con versiones, descarga y visualización protegidas, control de concurrencia, búsquedas, estados, periodos, filtros, paginación y CSV. La exportación previene fórmulas inyectadas en celdas.

Incapacidades: tipos solicitados en el prompt, EPS/ARL, fechas y duración inclusiva, validación de superposición, revisión de requisitos, texto del proyecto de resolución, soporte del proyecto, concepto jurídico, aprobación y resolución firmada, incorporación al expediente, registro del pago al funcionario, transcripción y radicación manual con evidencia, recobro, reconocimiento, reconocimientos adicionales, ingresos parciales, comunicación a financiera, contabilidad, conciliación, saldos, Control Interno y cierre condicionado. No se calcula una prestación médica con porcentajes no verificados.

Viáticos: objeto, destino, dependencia, fechas, duración y pernoctación, autorización inicial, solicitud y registro separados de CDP y RP, liquidación con escalas versionadas, proyecto y acto firmado, orden de pago, desembolsos parciales, informe de comisión, gastos y soportes, devolución de legalización, reintegros, conciliación y cierre condicionado. La liquidación conserva las tarifas y fuentes utilizadas. No se emiten documentos presupuestales ficticios ni se ejecutan pagos.

Administración: configuración inicial sin contraseña fija, roles explícitos, altas, cambio de permisos, desactivación, restablecimiento de contraseña, cambio personal de clave, bloqueo temporal por intentos fallidos, versiones normativas y de tarifas aprobadas por autoridad, y auditoría de accesos y actuaciones.

Seguimiento: bandeja por rol, indicadores por módulo, alertas de documentos faltantes, correcciones, vencimientos de etapas e hitos configurados. Los recordatorios se presentan en la aplicación; no se envían correos ni mensajes externos.

## Migraciones

Se creó y aplicó `core/0001_initial`, además de las migraciones estándar de autenticación, sesiones y tipos de contenido de Django. `makemigrations --check --dry-run` no detectó cambios pendientes. Las claves relacionadas usan protección de borrado; no existen operaciones de borrado histórico en la interfaz.

## Verificación

- Suite de pruebas: **41 pruebas aprobadas**, con base aislada que se destruye al finalizar.
- Los dos procedimientos se recorren completos tanto mediante servicios como mediante POST de los formularios HTTP reales. Se verifican documentos, presupuesto, liquidación, pagos, legalización, conciliación, cierre e historial.
- Se prueban documentación y campos faltantes, superposición de fechas, devoluciones y reenvío, actores autorizados y no autorizados, certificados restringidos, archivos con firma/extensión inválida y exceso de tamaño, solicitudes obsoletas, pagos duplicados/futuros/excesivos, reconocimientos adicionales, saldos pendientes, nuevas conciliaciones, escalas inaplicables, RP insuficiente, CSV filtrado, CSRF, acceso inicial, Scrypt, cambio de contraseña, cierre de sesión y usuarios inactivos.
- `manage.py check`: sin incidencias.
- `manage.py check --deploy` con configuración de producción y secreto temporal en memoria: sin incidencias. Este chequeo no sustituye una instalación y auditoría productivas. Con configuración local aparecen las advertencias esperadas por HTTP y DEBUG.
- Servidor local: comprobadas respuestas HTTP 200 para configuración inicial, CSS y JavaScript. No se creó un administrador ni se cargaron expedientes en la base de uso durante esta comprobación.
- Copia consistente de SQLite: comando ejecutado correctamente en `var/backups/`.
- No se dispuso de una herramienta de navegador interactivo en esta sesión. Las plantillas se renderizaron y recorrieron mediante el cliente HTTP de Django, pero la apariencia responsive, el diálogo JavaScript y la previsualización PDF no se verificaron visualmente en un navegador.

## Pendientes normativos e institucionales

No se recibieron las resoluciones 109 de 2021, 067 de 2025 y 093 de 2023, con sus tablas, páginas y diagramas. La búsqueda pública realizada no permitió identificar sus textos con certeza. No se inventaron citas ni páginas; la matriz marca las fuentes como pendientes.

Es necesario confirmar:

1. Sujetos habilitados y tratamiento de contratistas por cada prestación y comisión.
2. Secuencia oficial de actividades, autoridades, delegaciones y posibles excepciones o pasos condicionales por tipo de incapacidad/licencia.
3. Documentos exigidos y responsables de cada etapa, incluida la participación de Secretaría, Jurídica y Control Interno.
4. Plazos, días hábiles frente a calendario, prórrogas, suspensión de términos, hitos de rehabilitación y acumulación de incapacidades continuas.
5. Bases, porcentajes, topes, fuentes y vigencias de cálculos de prestaciones médicas. Actualmente se registran importes documentados sin calcular derechos legales.
6. Escalas, factores por pernoctación/destino y reglas de liquidación de días y transporte. La fórmula técnica requiere contraste institucional antes de registrar tarifas aprobadas.
7. Condiciones para cierres con reconocimiento parcial o rechazo de EPS/ARL, castigo de cartera, compensaciones, ajustes bancarios, anulaciones y mayores gastos de viaje. Se mantienen bloqueados los cierres descuadrados; no hay un mecanismo para borrar pagos o condonar saldos.
8. Retención documental, clasificación de información, accesos clínicos, política de respaldos y requisitos de firma y archivo institucional.

Los parámetros permiten reasignar responsables, agregar documentos y definir plazos e hitos sin modificar versiones históricas. No permiten alterar arbitrariamente el orden del flujo o eliminar controles. Si las fuentes exigen otra secuencia o excepciones, habrá que ajustar y volver a probar el motor antes de aprobarlo.

## Alcance externo y despliegue

No se implementaron integraciones externas con EPS/ARL, bancos, presupuesto, firma electrónica, correo/SMS o identidad institucional. El sistema registra las gestiones manuales, soportes, responsables y resultados; no afirma ejecutarlas ante terceros.

La ejecución local tiene controles de acceso, sesiones, validación y almacenamiento privado. Antes del uso institucional se necesitan infraestructura HTTPS, servidor WSGI, cifrado del almacenamiento y respaldos, revisión de protección de datos, análisis antivirus de documentos y pruebas visuales y de aceptación con los procedimientos oficiales. El repositorio incluye configuración de producción, pero no se realizó despliegue externo.

Las instrucciones para instalar, crear usuarios, configurar versiones, probar y respaldar están en [README.md](../README.md).
