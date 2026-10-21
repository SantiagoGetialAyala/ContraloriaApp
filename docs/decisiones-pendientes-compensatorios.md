# Decisiones pendientes · Gestión de Compensatorios

Fecha de corte: 20 de octubre de 2026.

## Estado de la fuente

No se encontró en el repositorio un procedimiento, resolución, circular, manual o acuerdo oficial sobre compensatorios. Por ello, ninguna equivalencia, límite, plazo, requisito o competencia se presenta como vigente. El flujo implementado es un prototipo técnico para validación de Talento Humano.

## Controles confirmados por el alcance del proyecto

Estos controles provienen del objetivo de esta etapa, no de una norma institucional:

- El registro de tiempo trabajado no reconoce saldo por sí mismo.
- El reconocimiento requiere una actuación expresa de un rol autorizado.
- El disfrute del compensatorio requiere otra autorización expresa y saldo suficiente.
- Una versión provisional o una configuración con `enabled: false` no puede generar créditos ni débitos.
- Cada movimiento conserva expediente, actor, fecha, minutos y referencia de la regla aplicada.
- Los documentos, actuaciones, consultas y descargas usan los controles existentes de permisos y auditoría.

## Propuesta técnica, no oficial

La ruta propuesta es: registro de tiempo, revisión de soportes, autorización del reconocimiento, solicitud de compensatorio, validación de saldo, autorización del disfrute, programación y cierre. Los responsables iniciales son solicitante, Talento Humano y autoridad competente. Todos deben contrastarse antes de habilitar reglas.

La configuración admite:

- `roles`: responsables por etapa.
- `transitions`: destino y roles de cada avance, limitado a rutas que no omitan controles.
- `deadlines`: plazos en días calendario.
- `additional_documents`: evidencias adicionales por etapa.
- `compensatory_rules`: habilitación, minutos por día, límites de crédito y solicitud, requisitos y condiciones de aprobación.

Ejemplo estructural deliberadamente deshabilitado:

```json
{
  "roles": {},
  "deadlines": {},
  "additional_documents": {},
  "milestones": [],
  "transitions": [],
  "compensatory_rules": {
    "enabled": false
  }
}
```

## Decisiones que Talento Humano debe confirmar

1. Población cubierta: funcionarios, provisionales, libre nombramiento, trabajadores oficiales y exclusión o tratamiento de contratistas.
2. Hechos que generan tiempo compensable y actividades excluidas.
3. Quién ordena o autoriza previamente el trabajo adicional y quién certifica su ejecución.
4. Soportes obligatorios, firmas, formatos, canales y reglas de subsanación.
5. Equivalencia entre horas, fracciones y días; redondeos y tratamiento de pausas, nocturnidad, dominicales y festivos.
6. Mínimos y máximos por registro, solicitud, día, mes, vigencia y funcionario.
7. Caducidad, acumulación, traslado entre vigencias y tratamiento al retiro o cambio de vinculación.
8. Antelación de la solicitud, plazos de respuesta y si se cuentan días hábiles o calendario.
9. Responsables titulares, delegaciones, suplencias, impedimentos y segregación de funciones.
10. Causales de devolución, rechazo, cancelación, reprogramación y reversión de movimientos ya autorizados.
11. Reglas de superposición con vacaciones, incapacidades, comisiones, permisos y otros eventos de calendario.
12. Visibilidad, retención, archivo, reportes, notificaciones externas y datos que deben integrarse con nómina o control de asistencia.

## Criterio para habilitar

La autoridad debe registrar una nueva versión con fuente, páginas, referencia de aprobación y todos los valores requeridos. Solo entonces puede establecer `compensatory_rules.enabled` en `true`. Los expedientes abiertos con una versión provisional conservan su bloqueo y no se actualizan retroactivamente.
