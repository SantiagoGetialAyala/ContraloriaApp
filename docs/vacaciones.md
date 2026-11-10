# Módulo de Vacaciones · Fase 1 (backend)

Estado al 7 de noviembre de 2026. Reemplaza el «Formato de Programación de vacaciones 2026.xls» de Talento Humano. Ese archivo contiene datos personales y **no se incorpora al repositorio** ni se usa en pruebas.

## Qué resuelve frente al formato en Excel

| Problema del formato actual | Comportamiento del sistema |
| --- | --- |
| La hoja «Fecha» solo tiene festivos de 2018–2020. En 6 de 10 filas de 2026 se otorgan 13 o 14 días hábiles en lugar de 15. | La fecha final se calcula con la tabla `Holiday`. Si un año no tiene festivos cargados, el cálculo se bloquea. |
| El periodo de causación está vacío en todas las filas. | Cada solicitud se asigna al periodo más antiguo con saldo, calculado desde la fecha de ingreso. |
| Cédulas repetidas entre personas distintas, encabezados de área copiados. | La cédula es única y el área es un registro (`Dependencia`) con su jefe. |
| Firma física del jefe y del servidor. | Visto bueno del jefe inmediato como etapa del expediente, con auditoría. |
| «Las vacaciones suspendidas deben programarse antes de un nuevo periodo». | Regla aplicada: los días pendientes del periodo más antiguo se programan primero. |

## Modelo de datos

- `Dependencia`: área con su `jefe`. Se crea automáticamente al registrar o editar un usuario con ese nombre de dependencia. La migración `0003` crea las dependencias a partir del texto de los perfiles existentes.
- `Profile`: nuevos campos `cedula` (única), `cargo`, `codigo`, `grado`, `hire_date` y `dependencia`. Se diligencian en **Usuarios y permisos**, junto con la casilla «Es jefe inmediato».
- `Holiday`: festivos. Se cargan con `python manage.py cargar_festivos 2026 2027`. El comando no sobrescribe festivos editados.
- `VacationPeriod`: un registro por año de servicio causado, con 15 días hábiles.
- `VacationLedgerEntry`: libro inmutable de días por periodo, con los movimientos `disfrute`, `devolucion` y `carga_inicial`. El saldo es `15 − disfrute − carga_inicial + devolucion`.

La lógica está en `core/vacations.py` (festivos, días hábiles, periodos, saldos, alertas) y en `core/services.py` (concesión, suspensión/aplazamiento, carga inicial, perfil).

## Flujo propuesto (expediente `vacaciones`)

```mermaid
flowchart LR
 A[Solicitud · funcionario] --> B[Visto bueno · jefe inmediato]
 B --> C[Saldo y cruces · Talento Humano]
 C --> D[Resolución · autoridad]
 D --> E[Disfrute y reintegro · Talento Humano]
 E --> F[Cerrado]
```

- El funcionario indica **fecha de inicio** y **días hábiles** (1 a 15). El sistema calcula el último día, la fecha de reintegro, los días calendario y el periodo asignado.
- «Jefe inmediato» es un rol relacional, igual que `owner`: lo ejerce el jefe de la dependencia del funcionario. Si el solicitante es el propio jefe o el área no tiene jefe, actúa la autoridad competente. Nadie aprueba sus propias vacaciones.
- El jefe ve solo las vacaciones enviadas de su equipo, no sus incapacidades ni viáticos.
- Se bloquean los cruces con otras vacaciones, incapacidades, comisiones o compensatorios del mismo funcionario.
- Los días se descuentan al completar la etapa de resolución. Desde ese momento no se admite devolución; se usan las novedades.
- **Suspensión** (durante el disfrute) y **aplazamiento** (antes de iniciar): solo Talento Humano, con soporte adjunto y una vez por expediente. Los días no disfrutados vuelven al mismo periodo.
- **Carga inicial**: `services.register_initial_vacation_days(...)` registra los días ya disfrutados de periodos anteriores. Todavía no tiene pantalla.

## Recordatorios en el panel

- Inicio de vacaciones en los próximos 15 días: para el funcionario, su jefe y Talento Humano.
- Reintegro en los próximos 3 días.
- 2 o más periodos acumulados con saldo.
- Periodo que prescribe en los próximos 180 días.

Los umbrales están en `core/vacations.py`. No se envían correos.

## Supuestos por confirmar con Talento Humano

1. 15 días hábiles por periodo; sábado y domingo no hábiles (el formato lo confirma).
2. Prescripción a los 4 años de causado el periodo; los periodos prescritos no se asignan.
3. Se emite una resolución por solicitud, firmada por la autoridad.
4. Diferencia entre «aplazada» (antes de iniciar) y «suspendida» (durante el disfrute).
5. Una solicitud no puede iniciar en sábado, domingo ni festivo.
6. Quién autoriza las vacaciones de la Contralora.
7. El festivo de Nuestra Señora del Rosario de Chiquinquirá se incluye desde 2026; verificar contra el calendario oficial.

## Pendiente para fases siguientes

- Plan anual por dependencia: el jefe o Talento Humano programan en nombre de los funcionarios.
- Calendario mensual por dependencia.
- Pantallas para festivos, carga inicial de saldos y jefes por dependencia.
- Formato imprimible para firma, reportes y correos de recordatorio.
