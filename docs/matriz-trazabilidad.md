# Matriz de trazabilidad técnica

Estado al 20 de octubre de 2026. Las fuentes oficiales no fueron aportadas, incluido el procedimiento de compensatorios. Las actividades y los responsables son una propuesta a partir del prompt; no se atribuyen páginas ni reglas a documentos no revisados. La implementación y sus pruebas no certifican cumplimiento normativo.

La tabla completa, con condiciones, evidencias y componentes, está en [matriz-trazabilidad.csv](matriz-trazabilidad.csv). Las vistas también muestran los responsables y documentos del expediente con su versión de configuración.

| Módulo | Estado inicial | Actividad | Responsable propuesto | Evidencia | Estado siguiente |
| --- | --- | --- | --- | --- | --- |
| Incapacidades / recobro | borrador | Registro de incapacidad | Solicitante titular (propuesto; verificar fuente) | Certificado médico | revision |
| Incapacidades / recobro | revision | Verificación de requisitos | Talento Humano (propuesto; verificar fuente) | Historial de actuación y registros financieros cuando corresponda | proyecto |
| Incapacidades / recobro | proyecto | Proyecto de resolución | Talento Humano (propuesto; verificar fuente) | Proyecto de resolución | juridica |
| Incapacidades / recobro | juridica | Revisión jurídica | Asesoría Jurídica (propuesto; verificar fuente) | Concepto jurídico | autorizacion |
| Incapacidades / recobro | autorizacion | Aprobación y acto firmado | Contralor / autoridad competente (propuesto; verificar fuente) | Resolución firmada | archivo |
| Incapacidades / recobro | archivo | Incorporación al expediente | Secretaría de Despacho (propuesto; verificar fuente) | Constancia de incorporación al expediente | pago_funcionario |
| Incapacidades / recobro | pago_funcionario | Pago al funcionario | Tesorería (propuesto; verificar fuente) | Soporte de pago al funcionario | transcripcion |
| Incapacidades / recobro | transcripcion | Transcripción ante EPS / ARL | Talento Humano (propuesto; verificar fuente) | Evidencia de transcripción y radicación | recobro |
| Incapacidades / recobro | recobro | Solicitud de recobro | Talento Humano (propuesto; verificar fuente) | Solicitud de recobro radicada | seguimiento |
| Incapacidades / recobro | seguimiento | Seguimiento y reconocimiento | Talento Humano (propuesto; verificar fuente) | Reconocimiento o decisión de la entidad | recaudo |
| Incapacidades / recobro | recaudo | Registro de recuperación | Tesorería (propuesto; verificar fuente) | Historial de actuación y registros financieros cuando corresponda | comunicacion |
| Incapacidades / recobro | comunicacion | Comunicación a financiera | Tesorería (propuesto; verificar fuente) | Comunicación al área financiera | contabilidad |
| Incapacidades / recobro | contabilidad | Registro contable | Contabilidad (propuesto; verificar fuente) | Comprobante contable | conciliacion |
| Incapacidades / recobro | conciliacion | Conciliación interna | Contabilidad (propuesto; verificar fuente) | Soporte de conciliación | saldos |
| Incapacidades / recobro | saldos | Gestión de saldos | Talento Humano (propuesto; verificar fuente) | Comunicaciones y gestión de saldos | control |
| Incapacidades / recobro | control | Revisión de Control Interno | Control Interno (propuesto; verificar fuente) | Revisión de Control Interno | cierre |
| Incapacidades / recobro | cierre | Cierre del procedimiento | Talento Humano (propuesto; verificar fuente) | Constancia de cierre | cerrado |
| Viáticos | borrador | Solicitud de comisión | Solicitante titular (propuesto; verificar fuente) | Soportes de la solicitud | revision |
| Viáticos | revision | Revisión de solicitud | Talento Humano (propuesto; verificar fuente) | Historial de actuación y registros financieros cuando corresponda | autorizacion_inicial |
| Viáticos | autorizacion_inicial | Autorización de comisión | Contralor / autoridad competente (propuesto; verificar fuente) | Autorización de comisión | solicitud_cdp |
| Viáticos | solicitud_cdp | Solicitud de disponibilidad | Talento Humano (propuesto; verificar fuente) | Solicitud de CDP | cdp |
| Viáticos | cdp | Disponibilidad y CDP | Presupuesto (propuesto; verificar fuente) | CDP oficial registrado | liquidacion |
| Viáticos | liquidacion | Liquidación de viáticos | Talento Humano (propuesto; verificar fuente) | Soporte de liquidación | proyecto |
| Viáticos | proyecto | Proyecto de resolución | Talento Humano (propuesto; verificar fuente) | Proyecto de resolución | juridica |
| Viáticos | juridica | Revisión jurídica | Asesoría Jurídica (propuesto; verificar fuente) | Concepto jurídico | autorizacion |
| Viáticos | autorizacion | Aprobación y acto firmado | Contralor / autoridad competente (propuesto; verificar fuente) | Resolución firmada | solicitud_rp |
| Viáticos | solicitud_rp | Solicitud de registro presupuestal | Talento Humano (propuesto; verificar fuente) | Solicitud de RP | rp |
| Viáticos | rp | Registro presupuestal | Presupuesto (propuesto; verificar fuente) | RP oficial registrado | orden_pago |
| Viáticos | orden_pago | Orden de pago | Tesorería (propuesto; verificar fuente) | Orden de pago | pago |
| Viáticos | pago | Desembolso | Tesorería (propuesto; verificar fuente) | Historial de actuación y registros financieros cuando corresponda | comision |
| Viáticos | comision | Ejecución de la comisión | Solicitante titular (propuesto; verificar fuente) | Informe y evidencias de comisión | legalizacion |
| Viáticos | legalizacion | Legalización de gastos | Solicitante titular (propuesto; verificar fuente) | Soportes de gastos ejecutados | revision_legalizacion |
| Viáticos | revision_legalizacion | Revisión de legalización | Talento Humano (propuesto; verificar fuente) | Revisión de legalización | conciliacion |
| Viáticos | conciliacion | Conciliación financiera y reintegros | Contabilidad (propuesto; verificar fuente) | Soporte de conciliación | cierre |
| Viáticos | cierre | Cierre del expediente | Secretaría de Despacho (propuesto; verificar fuente) | Constancia de cierre | cerrado |
| Compensatorios | borrador | Registro de tiempo trabajado | Solicitante titular (propuesto; verificar fuente) | Soporte del tiempo trabajado | revision_soportes |
| Compensatorios | revision_soportes | Revisión de soportes | Talento Humano (propuesto; verificar fuente) | Revisión de soportes del tiempo trabajado | autorizacion_tiempo |
| Compensatorios | autorizacion_tiempo | Autorización de reconocimiento | Autoridad competente (propuesto; verificar fuente) | Autorización del reconocimiento de tiempo | solicitud_compensatorio |
| Compensatorios | solicitud_compensatorio | Solicitud de compensatorio | Solicitante titular (propuesto; verificar fuente) | Solicitud de compensatorio | validacion_saldo |
| Compensatorios | validacion_saldo | Validación de saldo y condiciones | Talento Humano (propuesto; verificar fuente) | Verificación de saldo y condiciones | autorizacion_compensatorio |
| Compensatorios | autorizacion_compensatorio | Autorización del compensatorio | Autoridad competente (propuesto; verificar fuente) | Autorización del compensatorio | programacion |
| Compensatorios | programacion | Programación y calendario | Talento Humano (propuesto; verificar fuente) | Historial de actuación | cierre |
| Compensatorios | cierre | Cierre y archivo | Talento Humano (propuesto; verificar fuente) | Constancia de cierre | cerrado |

## Decisiones y devoluciones

En cada etapa no inicial a cargo de un rol institucional se puede solicitar una devolución específica a la etapa previa, mientras no implique revertir actuaciones financieras. Se registra estado `correccion`, responsable de la etapa anterior, observaciones, nuevas evidencias y reenvío al revisor. La revisión inicial permite rechazo justificado. Cada avance verifica permisos, revisión concurrente, campos, documentos y condiciones financieras. Los estados terminales son de solo lectura.

La legalización puede devolverse al solicitante después del desembolso. No se admiten cierres con saldos por recuperar ni legalizaciones descuadradas. Las bajas de cartera, mayores valores ejecutados y correcciones de operaciones bancarias requieren un procedimiento institucional adicional, descrito como pendiente en la entrega.
