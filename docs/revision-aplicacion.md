# Revisión de la aplicación · 10 de noviembre de 2026

La revisión parte de React y del motor Django existentes. Se conservaron los cambios locales de hojas de vida. Las pruebas usan bases aisladas.

## Experiencia

- Inicio centrado en pendientes, expedientes recientes y alertas. Los indicadores y recursos siguen disponibles en una sección desplegable; los filtros generales también son desplegables.
- Una entrada por módulo: incapacidades, viáticos, vacaciones y compensatorios. Calendario, plan anual, expedientes y saldos de vacaciones permanecen dentro del mismo módulo.
- Se corrigió la ruta del calendario de compensatorios, que abría vacaciones.
- Cerrar sesión está visible en la cabecera. Cuenta y cambio de contraseña están al pie del menú. El acceso incluye autocompletado, mostrar contraseña y orientación para restablecerla con el administrador.
- Una sesión vencida vuelve al acceso y conserva el destino. Si el backend no responde, aparece un error recuperable.
- Menú móvil con fondo de cierre y Escape, foco visible, títulos por pantalla y estados de carga/error. Los formularios de expedientes advierten al salir mediante la interfaz o recargar si hay datos sin guardar.

## Historial y procedimiento

- El historial principal contiene actuaciones reales. Consultas, descargas y controles de acceso se muestran al activar un filtro; se conservan en la auditoría.
- Las transiciones aparecen solo cuando cambia el estado y usan nombres legibles de etapas.
- Las marcas de etapas provienen de las actuaciones registradas. Rechazar ya no completa todas las etapas posteriores; las devoluciones y reaperturas actualizan las marcas.
- Las etapas se consultan en un desplegable. La acción actual permanece en primer plano. No se alteró la secuencia del motor para aparentar un procedimiento distinto.
- Gestión, documentos, información, finanzas e historial tienen vistas internas dentro del expediente. Cambiar de vista conserva los datos del formulario; el enlace incluye la sección elegida.
- Paginar el historial ya no reinicia el formulario ni reemplaza silenciosamente su revisión. Decisiones y cargas documentales requieren guardar antes los cambios de etapa.
- Procedimientos muestra la versión más reciente con sus responsables y requisitos configurados, indicando si está aprobada.

## Vacaciones

- Se retiró la activación automática del plan ficticio. Sin registros se presenta un estado vacío con las acciones disponibles.
- La simulación usa funcionarios registrados aunque todavía no tengan solicitudes. Simular a otra persona es una consulta; se crea únicamente un borrador del usuario autenticado.
- El calendario parte del mes actual, permite cambiar de año y conserva la vista seleccionada al recargar mediante la URL.
- El calendario visual usa los festivos del backend. La vista previa del formulario calcula en Django con el calendario institucional, evitando una lista fija distinta a la usada al guardar.
- Las fechas sin hora ya no retroceden un día al mostrarse en Colombia.

## Acceso y documentos

- Usuarios y permisos concentra el registro de funcionarios, roles, activación y contraseñas. Hojas de vida concentra ficha laboral y documentos, con enlaces a la administración de acceso.
- Las API de hojas de vida se restringieron a Administración y Talento Humano. Talento Humano gestiona datos laborales y soportes, pero no cambia permisos ni crea cuentas mediante estas API.
- Se eliminó la contraseña de demostración como alternativa implícita. Se aplica la validación de contraseñas y se conserva al menos un administrador activo.
- Descargar hojas de vida exige ser el titular o tener un rol de gestión de personal. Estar autenticado ya no permite descargar documentos de cualquier persona.
- La API de expedientes no incluye observaciones médicas para roles distintos del titular y Talento Humano. Ocultarlas solo en pantalla no era suficiente.
- Se recuperó la política sandbox del visor de documentos exigida por las pruebas existentes.
- Se retiraron mensajes que inferían porcentajes de pago o el pagador a partir de la duración de una incapacidad; esos datos se registran y verifican en su etapa correspondiente.

## Rendimiento y comprobación

- Las pantallas secundarias se cargan al abrirlas. El JavaScript inicial del build bajó de aproximadamente 404 kB a 270 kB antes de compresión.
- Se comparten peticiones de sesión simultáneas. Los resúmenes aprovechan movimientos financieros y actuaciones precargados.
- El proxy funciona en desarrollo y en la vista previa del build. El README explica los dos servidores y el acceso por el puerto 5173.
- Se añadieron regresiones del backend y pruebas de Chromium para sesiones, permisos, privacidad, historial, flujo de solicitudes y vista móvil. Los comandos para reproducirlas están en el README.
- Verificación local: 77 pruebas Django, 10 recorridos Chromium, compilación de producción y lint. Se revisaron capturas de inicio, expediente y vacaciones en móvil. Las migraciones locales pendientes se aplicaron después de crear un respaldo en `var/backups/`.

## Límites

Corregir el software no acredita el procedimiento administrativo. Se requiere revisión institucional de resoluciones, responsables, plazos, requisitos, tarifas y reglas de compensatorios. Los expedientes provisionales conservan sus restricciones. Consulte también la matriz de trazabilidad y las decisiones pendientes incluidas en `docs/`.

No se verificaron integraciones externas con EPS/ARL, bancos, firma electrónica ni un despliegue institucional. La validación local no sustituye la aceptación por cada dependencia. La interfaz Django se mantiene por compatibilidad; el trabajo de experiencia se concentra en React.
