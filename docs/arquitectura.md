# Diseño e implementación

## Estructura

- `talento/settings.py`: entorno, sesiones, validadores de contraseña, base de datos y cabeceras.
- `talento/urls.py`: navegación y endpoints.
- `core/models.py`: usuarios institucionales, expedientes, documentos, versiones, movimientos e historial.
- `core/workflows.py`: secuencia propuesta, responsables, campos, evidencias y validación de configuración.
- `core/services.py`: transacciones, permisos de actuación, transiciones, cálculos y registro documental/financiero.
- `core/access.py`: visibilidad de expedientes y restricciones documentales.
- `core/forms.py`: validación de entradas y configuración.
- `core/views.py`: autenticación, formularios, consultas, reportes y administración.
- `core/templates/core/`, `core/static/core/`: interfaz responsive, navegación y confirmaciones.
- `core/migrations/0001_initial.py`: esquema inicial e integridad referencial.
- `tests/test_workflows.py`: escenarios funcionales, HTTP y controles de seguridad.

## Persistencia

Un usuario tiene perfil y roles de Django. Un expediente pertenece a un solicitante, conserva la dependencia de apertura y referencia una versión del procedimiento. Sus documentos, actuaciones, movimientos financieros y movimientos de tiempo se relacionan con claves protegidas frente al borrado en cascada. Cada movimiento conserva expediente, responsable y regla aplicada.

Los documentos conservan contenido, nombre saneado, tipo detectado por firma, tamaño, hash y autor. Se aceptan PDF, PNG y JPG de hasta 8 MB. Las descargas y vistas requieren autenticación, visibilidad del expediente y permiso documental; nunca se sirven desde una carpeta pública. La vista directa añade sandbox al contenido. La validación de firma de archivo no equivale a un análisis antivirus ni a validación criptográfica de firmas administrativas.

El historial registra actor, hora, acción, estados, observación y detalles de la validación. Las actuaciones exitosas se guardan en la misma transacción que el cambio. Las validaciones rechazadas por las vistas quedan registradas después de revertir la transacción de negocio. No hay endpoints de eliminación de expedientes, documentos, movimientos, versiones o actuaciones. El historial es de solo lectura en la aplicación; no es una bitácora criptográfica resistente a modificaciones por un administrador directo de SQLite.

## Motor de estados

Las transiciones solo avanzan a la etapa inmediatamente siguiente tras validar datos, soportes, rol y condiciones financieras. Una devolución guarda la etapa revisora y activa `correccion` con los requisitos y responsable de la etapa previa. Su reenvío vuelve al revisor, conservando las actuaciones previas y exigiendo documentos actualizados.

No se revierte un pago por una devolución. Una legalización sí puede devolverse tras el desembolso para corregir sus gastos y soportes. Después de recaudos que afecten controles ya realizados, se repiten Contabilidad y Conciliación con documentos nuevos. Los movimientos existentes nunca se sobrescriben.

Los cambios llevan una revisión incremental del expediente. Una escritura con revisión obsoleta se rechaza. Las operaciones usan transacciones `IMMEDIATE` de SQLite y bloqueo mediante ORM, evitando pagos simultáneos que superen los topes y registros duplicados en la aplicación local.

Las fuentes oficiales faltan: estas secuencias son propuestas técnicas.

El prototipo de compensatorios usa el mismo motor y admite responsables y transiciones versionados. Por seguridad, las transiciones configuradas solo pueden seguir aristas que no omitan controles obligatorios. La ruta propuesta es:

```mermaid
flowchart LR
 A[Registro de tiempo y soporte] --> B[Revisión de soportes]
 B --> C[Autorización expresa del reconocimiento]
 C --> D[Solicitud de compensatorio]
 D --> E[Validación de saldo]
 E --> F[Autorización expresa del disfrute]
 F --> G[Calendario y programación]
 G --> H[Cierre]
```

Esta ruta no es un procedimiento oficial. Una versión provisional nunca genera movimientos. El crédito se crea al completar `autorizacion_tiempo`, solamente si la versión está confirmada y `compensatory_rules.enabled` es verdadero. El débito se crea al completar `autorizacion_compensatorio`, tras comprobar saldo y superposiciones. El libro mayor es inmutable y tiene una restricción de un crédito y un débito por expediente.

```mermaid
flowchart LR
 A[Registro y revisión] --> B[Proyecto, jurídica y autoridad]
 B --> C[Expediente y pago al funcionario]
 C --> D[Transcripción y solicitud de recobro]
 D --> E[Reconocimiento y recuperación]
 E --> F[Comunicación, contabilidad y conciliación]
 F --> G[Saldos y Control Interno]
 G --> H[Cierre con versión confirmada]
```

```mermaid
flowchart LR
 A[Solicitud y revisión] --> B[Autorización inicial y solicitud de CDP]
 B --> C[CDP y liquidación versionada]
 C --> D[Proyecto, jurídica y acto firmado]
 D --> E[Solicitud de RP, RP y orden de pago]
 E --> F[Desembolso y comisión]
 F --> G[Legalización y revisión]
 G --> H[Conciliación, reintegros y cierre]
```

## Cálculos

Los importes se calculan con `Decimal`, nunca con `float`. Los días informativos son la diferencia entre fechas más uno. La liquidación es `días con pernoctación × tarifa aprobada + días sin pernoctación × tarifa aprobada + transporte autorizado`. Los días pagables no pueden superar la duración; los días con pernoctación no pueden superar las noches del intervalo. El responsable debe verificar estos parámetros contra la fuente institucional antes de aprobarla.

El CDP cubre la liquidación. El RP cubre el total autorizado sin superar el CDP. Los desembolsos no superan lo autorizado. La conciliación de viajes exige `desembolso − gastos − reintegros = 0`.

En recobros, se registran por separado el pago al funcionario, lo solicitado, lo reconocido y los ingresos efectivos. El saldo es `solicitado − recuperado` y la diferencia de reconocimiento es `solicitado − reconocido`. Una recuperación no supera lo solicitado ni lo reconocido. Los reconocimientos adicionales requieren nuevos soportes. Un saldo pendiente bloquea el cierre.

## Permisos

`solicitante`, `talento`, `juridica`, `tesoreria`, `contabilidad`, `presupuesto`, `secretaria`, `autoridad`, `control` y `administrador` son grupos explícitos. La propiedad del expediente habilita las etapas del solicitante. No hay privilegio de aprobación implícito por ser administrador o superusuario.

Los solicitantes ven sus propios expedientes. Los roles institucionales ven expedientes enviados de los módulos en los que intervienen; Presupuesto se limita a viáticos. Los borradores ajenos no se muestran. Los roles financieros acceden a categorías financieras de documentos y datos, con restricción adicional para certificados y soportes médicos. Un administrador puede gestionar usuarios y consultar metadatos de auditoría sin recibir acceso al contenido médico por ese rol.

Los cambios de responsables configurables deben respetar estas fronteras de acceso documental y de módulo. Una reasignación que requiera ampliar esas fronteras exige ajustar y probar `core/access.py`; la configuración no concede automáticamente acceso a certificados médicos.

## Endpoints

Todos los cambios exigen POST, sesión válida y CSRF. Las descargas, consultas y exportaciones son GET autenticados.

| Ruta | Acción |
| --- | --- |
| `/configurar/` | Primer administrador local, una sola vez. |
| `/ingresar/`, `/salir/`, `/cuenta/clave/` | Sesión y cambio de contraseña. |
| `/` | Panel con filtros, indicadores y bandeja por responsabilidad. |
| `/modulos/<kind>/` | Consulta filtrada y paginada. |
| `/modulos/<kind>/nuevo/` | Registro de borrador. |
| `/modulos/<kind>/reporte/` | CSV filtrado según visibilidad. |
| `/expedientes/<uuid>/` | Detalle completo y actuaciones paginadas. |
| `/expedientes/<uuid>/guardar/` | Guardar campos autorizados de la etapa. |
| `/expedientes/<uuid>/actuar/` | Continuar, devolver, rechazar o registrar seguimiento. |
| `/expedientes/<uuid>/documentos/` | Incorporar una nueva evidencia. |
| `/expedientes/<uuid>/movimientos/` | Registrar recuperación, desembolso o reintegro real. |
| `/expedientes/<uuid>/reconocimiento/` | Registrar reconocimiento adicional soportado. |
| `/documentos/<id>/ver/`, `/documentos/<id>/descargar/` | Acceso documental protegido y auditado. |
| `/administracion/usuarios/`, `/administracion/usuarios/<id>/` | Alta y administración de accesos. |
| `/administracion/auditoria/` | Metadatos de auditoría. |
| `/parametros/` | Versiones de procedimiento y escalas. |
| `/procedimientos/` | Matriz de etapas y responsables propuestos. |

`kind` admite `incapacidad`, `viatico` y `compensatorio`. `/compensatorios/calendario/` presenta solo solicitudes con débito autorizado y respeta la visibilidad de expedientes. Los endpoints devuelven HTML con formularios y redirecciones; no constituyen una API REST pública.
