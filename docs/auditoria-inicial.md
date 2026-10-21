# Auditoría inicial — Talento Humano

Fecha: 19 de octubre de 2026.

## Evidencia disponible

- El directorio de trabajo estaba vacío al iniciar la revisión. No se encontró código, configuración, base de datos, migraciones, pruebas ni instrucciones locales de proyecto.
- Se recibió el archivo de instrucciones «PROMPT PARA CODEX — IMPLEMENTACIÓN INTEGRAL DEL SISTEMA DE TALENTO HUMANO».
- No se recibieron los textos de las resoluciones 109 de 2021, 067 de 2025 y 093 de 2023. Sus números, fechas y descripciones provienen únicamente del prompt; no han sido verificados contra los documentos oficiales.

No es posible identificar una arquitectura existente ni comprobar actividades, páginas, responsables o condiciones oficiales con estos insumos. La siguiente matriz es un inventario provisional del prompt, no una certificación de cumplimiento normativo.

## Matriz provisional de trazabilidad

En todas las filas, la página y el responsable oficial están pendientes de verificar. Los componentes son propuestas, no archivos implementados.

| Documento citado | Página | Actividad solicitada | Responsable | Condición por verificar | Evidencia solicitada | Componente propuesto | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Resolución 109 de 2021 | Pendiente | Registrar incapacidad o licencia | Pendiente | Tipos, sujetos y requisitos admisibles | Certificado y soportes | Registro de incapacidades | Sin implementar |
| Resolución 109 de 2021 | Pendiente | Revisar, devolver y reenviar | Pendiente | Documentación obligatoria y correcciones | Observaciones e historial | Revisión documental | Sin implementar |
| Resolución 109 de 2021 | Pendiente | Elaborar, revisar y aprobar acto | Pendiente | Secuencia y autoridad competente | Proyecto, aprobaciones y resolución firmada | Actos administrativos | Sin implementar |
| Resolución 109 de 2021 | Pendiente | Radicar y transcribir | Pendiente | Entidad, plazos y resultado exigible | Radicado, fecha y constancia | Gestiones externas | Sin implementar |
| Resolución 067 de 2025 | Pendiente | Identificar expediente y verificar requisitos | Pendiente | Entrada al procedimiento de recobro | Expediente y lista de verificación | Apertura de recobro | Sin implementar |
| Resolución 067 de 2025 | Pendiente | Registrar acto, pago al funcionario y archivo | Pendiente | Precondiciones de recobro | Resolución y soporte de pago | Preparación del recobro | Sin implementar |
| Resolución 067 de 2025 | Pendiente | Transcribir, solicitar recobro y hacer seguimiento | Pendiente | Plazos, destinatarios y requisitos | Constancias y comunicaciones | Solicitud y seguimiento de recobro | Sin implementar |
| Resolución 067 de 2025 | Pendiente | Registrar reconocimiento y recuperación | Pendiente | Tratamiento de pagos parciales y diferencias | Reconocimiento y soportes de ingreso | Movimientos de recobro | Sin implementar |
| Resolución 067 de 2025 | Pendiente | Comunicar a financiera y registrar contabilidad | Pendiente | Responsables y secuencia | Comunicación y comprobante contable | Registro financiero | Sin implementar |
| Resolución 067 de 2025 | Pendiente | Conciliar y gestionar saldos | Pendiente | Condiciones de conciliación y cierre de saldos | Conciliación y requerimientos | Conciliación de recobro | Sin implementar |
| Resolución 067 de 2025 | Pendiente | Revisión por Control Interno y cierre | Pendiente | Controles y condiciones de cierre | Revisión y constancia de cierre | Cierre de recobro | Sin implementar |
| Resolución 093 de 2023 | Pendiente | Solicitar comisión | Pendiente | Campos y anexos exigibles | Solicitud y documentos | Solicitud de viáticos | Sin implementar |
| Resolución 093 de 2023 | Pendiente | Revisar, devolver, aprobar o rechazar | Pendiente | Competencias y orden de autorizaciones | Decisiones y acto administrativo | Autorización de comisión | Sin implementar |
| Resolución 093 de 2023 | Pendiente | Gestionar disponibilidad, CDP y RP | Pendiente | Secuencia presupuestal oficial | Documentos efectivamente registrados | Gestión presupuestal | Sin implementar |
| Resolución 093 de 2023 | Pendiente | Liquidar días, transporte y total | Pendiente | Escalas, vigencias y reglas de pernoctación | Versión de parámetros y liquidación | Liquidación versionada | Sin implementar |
| Resolución 093 de 2023 | Pendiente | Ordenar y registrar pago | Pendiente | Requisitos previos y autorización financiera | Orden y soporte de pago | Desembolso | Sin implementar |
| Resolución 093 de 2023 | Pendiente | Legalizar, corregir y registrar reintegros | Pendiente | Plazos, informe y documentos exigibles | Informe, gastos y reintegros | Legalización | Sin implementar |
| Resolución 093 de 2023 | Pendiente | Cerrar expediente | Pendiente | Aprobaciones, diferencias y archivo | Constancia de cierre | Cierre de comisión | Sin implementar |

## Insumos necesarios para continuar

1. Código del proyecto actual o su ubicación correcta. Si no existe, confirmar que se debe crear un proyecto nuevo.
2. Las tres resoluciones completas, incluidos anexos, tablas y diagramas. Se aceptan archivos o enlaces a sus publicaciones oficiales.
3. Si los documentos no los determinan: decisiones institucionales sobre competencias, visibilidad documental, plazos, escalas vigentes y condiciones de cierre.

Las dudas institucionales se documentarán y los parámetros correspondientes se versionarán. No se habilitará una regla normativa sin fuente o aprobación identificable.

## Validación realizada

Se inspeccionó el directorio de trabajo y se leyó el prompt adjunto. No se ejecutaron pruebas de aplicación: no hay aplicación ni entorno de ejecución que verificar. No se han implementado módulos, migraciones, autenticación ni integraciones.

## Actualización después de la autorización de construcción desde cero

El usuario autorizó expresamente crear el proyecto completo desde cero. El estado anterior describe la inspección inicial, no el resultado final. Ya existe una aplicación Django con los flujos técnicos, persistencia, interfaz y pruebas. Véanse [la entrega](entrega.md), [la arquitectura](arquitectura.md) y [la matriz actualizada](matriz-trazabilidad.md). La falta de resoluciones oficiales sigue vigente.

## Auditoría de continuidad · 20 de octubre de 2026

Se revisaron modelos, migraciones, motor de estados, servicios transaccionales, acceso documental, formularios, vistas, rutas, plantillas y 41 pruebas existentes. La línea base aprobó `manage.py check`, `makemigrations --check --dry-run` y las 41 pruebas antes de modificar el proyecto.

No se encontraron archivos PDF, DOCX, ODT, XLSX o XLS con los documentos oficiales dentro del repositorio. Por ello no fue posible certificar que la secuencia, responsables, plazos o documentos de incapacidades, recobros y viáticos coincidan con sus fuentes. La implementación existente sí conserva controles técnicos de rol, soportes, concurrencia, saldos y cierre, y su suite de regresión continuó aprobando después de integrar el tercer módulo.

La brecha estructural encontrada era la ausencia del tipo de expediente de compensatorios, de estados propios, de transiciones configurables, de un saldo auditable en unidades de tiempo y de calendario. Se implementaron estos componentes con bloqueo por defecto. El procedimiento propuesto y las decisiones institucionales pendientes se documentan en [decisiones-pendientes-compensatorios.md](decisiones-pendientes-compensatorios.md).
