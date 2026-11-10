# Talento Humano · Contraloría Municipal de Pasto

Aplicación local creada desde cero con **Django 6.0.4, SQLite y plantillas HTML/CSS/JavaScript**. Contiene tres módulos conectados a persistencia real: incapacidades y recobro, viáticos y gastos de viaje, y un prototipo de gestión de compensatorios.

Los flujos iniciales son propuestas técnicas basadas en el prompt recibido. **No se han recibido ni verificado las tres resoluciones oficiales ni el procedimiento oficial de compensatorios.** Los expedientes provisionales permiten probar el proceso, pero no obtener un cierre institucional ni reconocer o descontar tiempo. La autoridad puede registrar una versión confirmada tras revisar sus fuentes; se aplica a expedientes nuevos.

## Ejecutar

Requiere Python 3.12 o posterior. Desde esta carpeta:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```

Abra **http://127.0.0.1:8000/**. Si Django ya está instalado, puede ejecutar `./iniciar.command`; también puede abrir ese archivo desde Finder en macOS. El lanzador ejecuta las migraciones antes de iniciar.

La primera visita muestra la configuración del administrador. **No hay usuarios, expedientes, tarifas ni contraseñas predefinidas.** Cree su usuario con una contraseña de al menos 12 caracteres. El alta web inicial solo se permite desde la máquina local y está deshabilitada en producción.

Como alternativa para crear el primer administrador:

```sh
python manage.py bootstrap
```

## Primer recorrido

1. Entre como administrador y abra **Usuarios y permisos**. Cree los usuarios de cada dependencia y asigne sus roles. Puede cambiar permisos, desactivar usuarios y restablecer contraseñas; el sistema conserva al menos un administrador activo.
2. El administrador no tiene facultades de aprobación por ese rol. Asigne explícitamente `autoridad` al usuario competente. Para revisar solicitudes, use un usuario con el rol operativo correspondiente.
3. Entre como solicitante, cree una incapacidad o una comisión, guarde su borrador y adjunte los documentos. Envíelo a revisión.
4. Entre con el rol responsable de la etapa. Guarde sus datos, adjunte los soportes y complete la etapa. El expediente mostrará el siguiente responsable.
5. Una devolución debe identificar los campos o documentos que se deben corregir. El responsable de la etapa anterior podrá corregir y reenviar; los documentos exigidos deberán tener una versión nueva. Se conservan los documentos anteriores.
6. Para registrar movimientos financieros, Tesorería adjunta primero el soporte del tipo de movimiento y luego registra valor, fecha efectiva y referencia bancaria. Se admiten pagos parciales. El sistema no ejecuta transferencias.
7. Las diferencias de viáticos se concilian con gastos soportados y reintegros. Los saldos de recobro se mantienen abiertos hasta su recuperación. Una recuperación posterior a la conciliación devuelve el expediente a Contabilidad y exige nuevas evidencias de sus controles.
8. En compensatorios, el funcionario registra el tiempo trabajado y sus soportes. El registro no crea saldo. Una autoridad debe reconocer expresamente los minutos bajo reglas institucionales confirmadas; otra actuación expresa autoriza la solicitud y genera el descuento.

## Vacaciones

Antes de programar vacaciones, cargue los festivos del año: `python manage.py cargar_festivos 2026 2027`. En **Usuarios y permisos** registre la fecha de ingreso, la dependencia y el jefe inmediato de cada funcionario. El diseño, los supuestos y las decisiones pendientes están en [docs/vacaciones.md](docs/vacaciones.md). Para probar con datos ficticios, la guía de frontend ([docs/vacaciones-frontend.md](docs/vacaciones-frontend.md)) explica el comando `demo_vacaciones`. El manejo de ramas propuesto está en [docs/flujo-de-trabajo-git.md](docs/flujo-de-trabajo-git.md).

## Parámetros institucionales

En **Parámetros y normativa**, la autoridad puede:

- Registrar versiones del procedimiento con fuente, páginas, referencia de aprobación, responsables, plazos, documentos adicionales e hitos de seguimiento o rehabilitación.
- Registrar versiones de escalas de viáticos por categoría, destino, vigencia, tarifa con pernoctación y tarifa sin pernoctación. No se precargan cifras legales.
- Definir para compensatorios responsables, transiciones seguras, equivalencia de minutos por día, límites, requisitos y condiciones de aprobación. `compensatory_rules.enabled` debe permanecer en `false` hasta la validación institucional.

La categoría y el destino deben coincidir con la solicitud; la escala debe cubrir toda la comisión. La liquidación conserva una copia de tarifas, fuente, aprobador, fecha y responsable. La duración informativa cuenta días calendario inclusivos; los días pagables se introducen y verifican por separado. No se asume una regla porcentual de pago médico.

Ejemplo **de estructura**, sin imponer plazos administrativos:

```json
{
  "roles": {"revision": ["talento"]},
  "deadlines": {},
  "additional_documents": {},
  "milestones": [],
  "transitions": []
}
```

`deadlines` relaciona una clave de etapa con días calendario. Cada elemento de `milestones` tiene `day`, `label` y `role`: se cuenta desde el inicio de la incapacidad. Configure únicamente valores respaldados por la fuente institucional. Las claves de etapa y los responsables propuestos están en la pantalla **Procedimientos** y en [la matriz técnica](docs/matriz-trazabilidad.md).

Las versiones se agregan; la interfaz no modifica las anteriores. Un expediente conserva su versión. Si cambia el orden de actividades exigido por las resoluciones, se debe modificar y probar el motor antes de aprobar el procedimiento: el formulario de configuración no cambia la secuencia ni elimina controles obligatorios.

## Pruebas y comprobaciones

```sh
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py test tests --noinput
```

La suite usa una base de datos aislada que se elimina al finalizar. Los usuarios, documentos, fuentes y tarifas de prueba **no se insertan en la base de uso**. Incluye recorridos completos por servicios y formularios HTTP, devoluciones, permisos, documentos privados, conciliaciones, saldos, escalas, presupuestos, CSRF, concurrencia, exportación y autenticación.

Consulte los resultados y límites de verificación en [la entrega](docs/entrega.md).

## Persistencia y respaldo

Los datos se guardan en `var/talento.sqlite3`. Los archivos se almacenan en la misma base con sus metadatos y SHA-256, sin rutas públicas. `var/.secret` contiene la clave local y se crea con permisos restrictivos. Todo `var/` está excluido del control de versiones.

```sh
python manage.py backup
```

El comando usa el mecanismo de copia consistente de SQLite y escribe en `var/backups/` con permisos restrictivos. Para restaurar, detenga el servidor, conserve una copia del estado actual y reemplace `var/talento.sqlite3` por la copia elegida. Conserve la clave del entorno por separado. Los respaldos contienen información personal: protéjalos con los controles de almacenamiento institucionales.

## Preparar una instalación institucional

Esta entrega se ejecuta localmente. `runserver` es para desarrollo y validación. La instalación institucional requiere un servidor WSGI, servicio de archivos estáticos, HTTPS y almacenamiento con acceso restringido y cifrado del volumen y de sus respaldos.

Variables de entorno:

| Variable | Uso |
| --- | --- |
| `TALENTO_PRODUCTION=1` | Desactiva DEBUG y activa HTTPS, HSTS y cookies seguras. |
| `DJANGO_SECRET_KEY` | Obligatoria en producción; use un secreto aleatorio externo al código. |
| `DJANGO_ALLOWED_HOSTS` | Obligatoria en producción; dominios autorizados separados por comas. |
| `TALENTO_DATA_DIR` | Ubicación privada de la base de datos y respaldos; por defecto `var/`. |

Después de configurar el entorno, ejecute migraciones, `python manage.py collectstatic --noinput` y `python manage.py check --deploy`. El servidor WSGI usa `talento.wsgi:application`; sirva `/static/` desde `staticfiles/`. No sirva `var/` como archivos web. No se habilita confianza automática en cabeceras de proxy: configure el proxy y sus cabeceras según la infraestructura real.

La aplicación controla el acceso por sesión y rol, usa CSRF, escape HTML, consultas ORM y cabeceras de seguridad. Restringe certificados médicos y soportes de incapacidad a su titular y Talento Humano; oculta observaciones médicas a roles financieros. Registra consultas y descargas. El bloqueo de acceso tras cinco fallos por combinación de usuario y dirección dura 15 minutos.

Quedan fuera de esta entrega local: integración con EPS/ARL, bancos y sistemas presupuestales, firma electrónica, correo o SMS, antivirus de documentos, SSO/MFA y cifrado a nivel de aplicación. Las radicaciones, certificados presupuestales y pagos son **registros manuales con evidencias**, no ejecuciones externas. Las dudas normativas y condiciones excepcionales están descritas en [la entrega](docs/entrega.md).
