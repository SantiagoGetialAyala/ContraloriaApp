# Módulo de acuerdos sindicales · Fase 1

Estado al 24 de noviembre de 2026. Fuentes: «Análisis Acuerdos Sindicales.xlsx» (Control Interno), Resolución 136 de 2019 y Resolución 080 de 2023. Los archivos originales no se incorporan al repositorio.

## Qué se encontró en los documentos

- No son ~24 acuerdos independientes: son **3 acuerdos** con ASDECCOL Subdirectiva Nariño, con **32 puntos** en total.

  | Acuerdo | Firma | Acto de adopción | Puntos |
  | --- | --- | --- | --- |
  | 2015 | 21 de mayo de 2015 | No identificado | 16 |
  | 2019 | 8 de abril de 2019 | Resolución 136 del 7 de mayo de 2019 | 5 |
  | 2023 | 7 de marzo de 2023 | Resolución 080 del **15 de marzo** de 2023 | 11 |

- El Excel dice «15 de mayo» para 2023 y el nombre del PDF dice «15-02-23». La fecha de la resolución escaneada es el 15 de marzo.
- **Los tres rigen a la vez.** La Resolución 080 indica que sus disposiciones, «junto a las contenidas en acuerdos colectivos sindicales anteriores», rigen las relaciones laborales.
- **Aplican a servidores públicos**, no a contratistas (artículo segundo del acuerdo de 2019).
- Una **Comisión Bipartita** verifica el cumplimiento **cada semestre** (artículo décimo octavo de 2019).
- La columna «SEGUIMIENTO» del Excel está vacía en todas las filas: ese es el vacío que cubre el módulo.
- Los textos del Excel son resúmenes de Control Interno. Hubo dos correcciones con el texto de la Resolución 080:
  - **Artículo 9:** el Excel no traía el contenido.
  - **Artículo 11:** traía una nota interna mezclada con el texto.
- Se omiten, igual que en el análisis de Control Interno, los artículos de procedimiento. Por ejemplo, los artículos 12 y 13 de 2023 solo regulan los turnos y la forma de compensar.

## Cómo funciona

- **Puntos** (`PuntoAcuerdo`). Hay dos tipos:
  - **Beneficio para funcionarios:** cumpleaños, permisos, antigüedad, descanso compensado… Se registra a quién se le concedió.
  - **Compromiso de la entidad:** dotación, prima, bienestar, salud ocupacional… Se registra que la entidad cumplió.
- **Periodicidad** de cada punto:
  - *cuando un funcionario lo solicita*,
  - *una vez al año*,
  - *seguimiento cada semestre*, que coincide con la Comisión Bipartita.
- **Registros de cumplimiento** (`CumplimientoAcuerdo`): fecha, estado (solicitado, concedido o negado), descripción y beneficiarios. Siguen siendo **modificables**, y cada cambio queda en la auditoría con el valor anterior.
- **Evidencias** (`EvidenciaSindical`):
  - Tipos: solicitud, resolución, constancia u otro, más el documento firmado de cada acuerdo.
  - Formatos: PDF, JPG o PNG de hasta 10 MB.
  - **No se pueden borrar.**
- **Estado de cada punto**, en palabras:
  - *Al día*.
  - *Falta evidencia*: un registro concedido no tiene todos los soportes exigidos; uno en trámite solo exige la solicitud.
  - *Sin seguimiento*: es anual o semestral y no tiene registro en el periodo.
  - *Sin registros*: nadie lo ha solicitado.
- **Próximos beneficios (30 días):**
  - Cumpleaños, que exige la nueva **fecha de nacimiento** en la hoja de vida.
  - Aniversarios de ingreso: un día por antigüedad (artículo 5 de 2023) e incentivo de 1 a 4 días cada 4 años (artículo 15 de 2023).
- **Permisos:**
  - Consultan Talento Humano, Control Interno, la autoridad y la Secretaría.
  - Solo Talento Humano (y el administrador) registra.

Código: `core/acuerdos.py`, modelos en `core/models.py`, datos iniciales en `core/data/acuerdos_sindicales.json` (cargados por la migración `0005`), API en `core/api.py`, pantalla `Front_Contraloria/src/pages/AcuerdosSindicalesPage.tsx`, pruebas en `tests/test_acuerdos.py`.

## Supuestos por confirmar con la Contraloría

1. **Evidencias exigidas:** los beneficios piden solicitud, resolución y constancia, y los compromisos solo la constancia. ¿Un cumpleaños necesita resolución, o basta con la solicitud y la constancia?
2. **Periodicidad de cada punto:** se propuso cuál es anual o semestral. Revisarla punto por punto.
3. **Quién registra:** ¿los integrantes de la Comisión Bipartita deben poder consultar o registrar?
4. **Número y acto del acuerdo de 2015:** el Excel lo identifica como «1», sin resolución de adopción.
5. **Descanso compensado de Carnavales (artículo 9):** hoy se registra como beneficio con evidencias. Si se quiere controlar las horas compensadas por persona, conviene conectarlo con el módulo de compensatorios.

## Pendiente para fases siguientes

- Reporte semestral para la Comisión Bipartita (PDF o Excel).
- Que cada funcionario vea sus propios beneficios del acuerdo.
- Conectar el descanso compensado con el módulo de compensatorios.
- Pantalla para editar puntos, periodicidades y evidencias exigidas sin tocar el código.
