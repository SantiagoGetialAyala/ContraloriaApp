import { CalculadoraTramite, FormateadorTexto } from './Formatters';
import type {
  CaseDetailDTO,
  CaseKind,
  CaseSummaryDTO,
  CaseTotalsDTO,
  CompensatorySummaryDTO,
} from './types';

export interface PeriodoResumen {
  principal: string;
  secundario: string;
}

export interface IndicadorFinanciero {
  label: string;
  value: string;
}

/**
 * Clase abstracta base que modela un Expediente Administrativo en POO.
 * Encapsula el estado común y define operaciones polimórficas que cada subclase
 * (Incapacidad, Viático, Compensatorio) implementa según sus reglas de negocio.
 */
export abstract class ExpedienteBase {
  protected readonly dto: CaseSummaryDTO;
  protected readonly detailDto: CaseDetailDTO | null;

  public constructor(dto: CaseSummaryDTO, detailDto: CaseDetailDTO | null = null) {
    this.dto = dto;
    this.detailDto = detailDto;
  }

  public get id(): string {
    return this.dto.id;
  }

  public get kind(): CaseKind {
    return this.dto.kind;
  }

  public get kindDisplay(): string {
    return this.dto.kind_display;
  }

  public get reference(): string {
    return this.dto.reference;
  }

  public get ownerName(): string {
    return this.dto.owner.full_name || this.dto.owner.username;
  }

  public get ownerEmployment(): string {
    return this.dto.owner.employment || 'Funcionario';
  }

  public get department(): string {
    return this.dto.department;
  }

  public get stage(): string {
    return this.dto.stage;
  }

  public get stageLabel(): string {
    return this.dto.stage_label;
  }

  public get progress(): number {
    return this.dto.progress;
  }

  public get overdue(): boolean {
    return this.dto.overdue;
  }

  public get dueAt(): string | null {
    return this.dto.due_at;
  }

  public get revision(): number {
    return this.dto.revision;
  }

  public get policyVersion(): number {
    return this.dto.policy_version;
  }

  public get policyConfirmed(): boolean {
    return this.dto.policy_confirmed;
  }

  public get createdAt(): string {
    return this.dto.created_at;
  }

  public get updatedAt(): string {
    return this.dto.updated_at;
  }

  public get data(): Record<string, unknown> {
    return this.dto.data;
  }

  public get totals(): CaseTotalsDTO {
    return this.dto.totals;
  }

  public get compensatory(): CompensatorySummaryDTO | null {
    return this.dto.compensatory;
  }

  public get detalle(): CaseDetailDTO | null {
    return this.detailDto;
  }

  public esCerrado(): boolean {
    return this.stage === 'cerrado';
  }

  public esRechazado(): boolean {
    return this.stage === 'rechazado';
  }

  public esTerminal(): boolean {
    return this.esCerrado() || this.esRechazado();
  }

  public estaEnCorreccion(): boolean {
    return this.stage === 'correccion';
  }

  public getBadgeEstadoClass(): string {
    if (this.esCerrado()) return 'badge success';
    if (this.esRechazado()) return 'badge danger';
    if (this.estaEnCorreccion()) return 'badge warning';
    return 'badge';
  }

  public getTextoBotonAvance(): string {
    if (this.stage === 'borrador') return 'Enviar a revisión';
    if (this.stage === 'correccion') return 'Reenviar corrección';
    if (
      this.stage === 'comprobante' ||
      this.stage === 'comision' ||
      this.stage === 'cierre' ||
      this.stage === 'disfrute'
    ) {
      return 'Cerrar expediente';
    }
    return 'Completar etapa';
  }

  // Métodos polimórficos obligatorios en cada subclase
  public abstract getIcono(): string;
  public abstract getTituloModulo(): string;
  public abstract getSubtituloModulo(): string;
  public abstract getResumenPeriodo(): PeriodoResumen;
  public abstract getEtiquetaDuracion(): string;
  public abstract getTituloSeccionFinanzas(): string;
  public abstract getSubtituloSeccionFinanzas(): string;
  public abstract getIndicadoresFinancieros(): IndicadorFinanciero[];
  public abstract getMensajeFlujoProvisional(): string;
  public abstract getAvisosEtapaActual(stepKey?: string): string[];
}

/**
 * Subclase concreta para expedientes de Incapacidades y Recobro.
 */
export class ExpedienteIncapacidad extends ExpedienteBase {
  public override getIcono(): string {
    return '✚';
  }

  public override getTituloModulo(): string {
    return 'Incapacidades y recobro';
  }

  public override getSubtituloModulo(): string {
    return 'Consulte el trámite administrativo y dé seguimiento a cada recobro.';
  }

  public override getResumenPeriodo(): PeriodoResumen {
    const start = String(this.data.start_date || 'Sin definir');
    const end = String(this.data.end_date || 'Sin definir');
    const days = this.data.days ? String(this.data.days) : '—';
    return {
      principal: start,
      secundario: `${end} · ${days} días calendario`,
    };
  }

  public override getEtiquetaDuracion(): string {
    const days = this.data.days ? String(this.data.days) : '—';
    return `${days} días calendario`;
  }

  public override getTituloSeccionFinanzas(): string {
    return 'Control financiero';
  }

  public override getSubtituloSeccionFinanzas(): string {
    return 'Importes en pesos colombianos. Los movimientos registrados conservan sus soportes.';
  }

  public override getIndicadoresFinancieros(): IndicadorFinanciero[] {
    return [
      { label: 'Solicitado', value: FormateadorTexto.moneda(this.totals.requested) },
      { label: 'Reconocido', value: FormateadorTexto.moneda(this.totals.recognized) },
      { label: 'Recuperado', value: FormateadorTexto.moneda(this.totals.recovered) },
      { label: 'Saldo por recuperar', value: FormateadorTexto.moneda(this.totals.pending) },
      { label: 'Diferencia de reconocimiento', value: FormateadorTexto.moneda(this.totals.difference) },
    ];
  }

  public override getMensajeFlujoProvisional(): string {
    return 'Las responsabilidades y controles deben contrastarse con las resoluciones. Esta versión permite probar el trámite y bloquea su cierre institucional.';
  }

  public override getAvisosEtapaActual(stepKey?: string): string[] {
    const avisos: string[] = [];
    if (stepKey === 'transcripcion') {
      avisos.push(
        'La radicación es un registro manual con evidencia. El sistema no radica ante EPS o ARL ni cuenta con integración externa.',
      );
    }
    if (stepKey === 'pago_funcionario') {
      const days = Number(this.data.days || 0);
      if (days > 0) {
        avisos.push(
          `Criterio institucional de pago (Resolución 067/2025): ${CalculadoraTramite.determinarResponsablePagoIncapacidad(days)}`,
        );
      }
    }
    if (stepKey === 'comprobante') {
      avisos.push(
        'Paso final de cierre: Incorpore el comprobante si ya dispone de él. Adjuntar el comprobante es opcional dado que las entidades tardan en mandarlo; al avanzar se cierra el expediente.',
      );
    }
    return avisos;
  }
}

/**
 * Subclase concreta para expedientes de Viáticos y Gastos de Viaje.
 */
export class ExpedienteViatico extends ExpedienteBase {
  public override getIcono(): string {
    return '↗';
  }

  public override getTituloModulo(): string {
    return 'Viáticos y gastos de viaje';
  }

  public override getSubtituloModulo(): string {
    return 'Acompañe cada comisión desde la solicitud hasta su legalización.';
  }

  public override getResumenPeriodo(): PeriodoResumen {
    const start = String(this.data.start_date || 'Sin definir');
    const end = String(this.data.end_date || 'Sin definir');
    const days = this.data.days ? String(this.data.days) : '—';
    return {
      principal: start,
      secundario: `${end} · ${days} días calendario`,
    };
  }

  public override getEtiquetaDuracion(): string {
    const days = this.data.days ? String(this.data.days) : '—';
    return `${days} días calendario`;
  }

  public override getTituloSeccionFinanzas(): string {
    return 'Control financiero';
  }

  public override getSubtituloSeccionFinanzas(): string {
    return 'Importes en pesos colombianos. Los movimientos registrados conservan sus soportes.';
  }

  public override getIndicadoresFinancieros(): IndicadorFinanciero[] {
    return [
      { label: 'Total liquidado', value: FormateadorTexto.moneda(this.totals.authorized) },
      { label: 'Comprometido en RP', value: FormateadorTexto.moneda(this.totals.committed) },
      { label: 'Desembolsado', value: FormateadorTexto.moneda(this.totals.paid) },
      { label: 'Gastos ejecutados', value: FormateadorTexto.moneda(this.totals.executed) },
      { label: 'Reintegrado', value: FormateadorTexto.moneda(this.totals.returned) },
      { label: 'Diferencia por conciliar', value: FormateadorTexto.moneda(this.totals.travel_balance) },
    ];
  }

  public override getMensajeFlujoProvisional(): string {
    return 'Las responsabilidades y controles deben contrastarse con las resoluciones. Esta versión permite probar el trámite y bloquea su cierre institucional.';
  }

  public override getAvisosEtapaActual(stepKey?: string): string[] {
    const avisos: string[] = [];
    if (stepKey === 'comision') {
      avisos.push(
        'Paso final de cumplimiento: Registre el informe de la comisión. Adjuntar el comprobante o archivo es opcional si tardan en remitirlo.',
      );
    }
    return avisos;
  }
}

/**
 * Subclase concreta para expedientes de Gestión de Compensatorios.
 */
export class ExpedienteCompensatorio extends ExpedienteBase {
  public override getIcono(): string {
    return '◷';
  }

  public override getTituloModulo(): string {
    return 'Gestión de compensatorios';
  }

  public override getSubtituloModulo(): string {
    return 'Registre tiempo trabajado y tramite solicitudes sin reconocer ni descontar saldos sin autorización.';
  }

  public override getResumenPeriodo(): PeriodoResumen {
    const workDate = String(this.data.work_date || 'Sin definir');
    const reqStart = String(this.data.request_start_date || 'Solicitud pendiente');
    const reqEnd = String(this.data.request_end_date || '—');
    return {
      principal: workDate,
      secundario: `${reqStart} · ${reqEnd}`,
    };
  }

  public override getEtiquetaDuracion(): string {
    const mins = this.data.worked_minutes !== undefined ? String(this.data.worked_minutes) : '—';
    return `${mins} minutos trabajados`;
  }

  public override getTituloSeccionFinanzas(): string {
    return 'Control de saldos';
  }

  public override getSubtituloSeccionFinanzas(): string {
    return 'Todos los valores están en minutos. Solo las autorizaciones expresas generan movimientos inmutables.';
  }

  public override getIndicadoresFinancieros(): IndicadorFinanciero[] {
    const c = this.compensatory || {
      worked: 0,
      approved: 0,
      credit: 0,
      debit: 0,
      requested: 0,
      balance: 0,
    };
    return [
      { label: 'Tiempo trabajado', value: `${c.worked} min` },
      { label: 'Reconocido en este expediente', value: `${c.approved} min` },
      { label: 'Créditos acumulados', value: `${c.credit} min` },
      { label: 'Tiempo disfrutado', value: `${c.debit} min` },
      { label: 'Solicitud actual', value: `${c.requested} min` },
      { label: 'Saldo disponible', value: `${c.balance} min` },
    ];
  }

  public override getMensajeFlujoProvisional(): string {
    return 'No se ha suministrado el procedimiento oficial. Esta versión permite probar el registro, pero bloquea todo reconocimiento y descuento de tiempo.';
  }

  public override getAvisosEtapaActual(): string[] {
    return [];
  }
}

/**
 * Subclase concreta para expedientes de Vacaciones.
 */
export class ExpedienteVacaciones extends ExpedienteBase {
  public override getIcono(): string {
    return '☀';
  }

  public override getTituloModulo(): string {
    return 'Vacaciones';
  }

  public override getSubtituloModulo(): string {
    return 'Programe vacaciones por días hábiles, con visto bueno del jefe, saldo por periodo y festivos descontados.';
  }

  public override getResumenPeriodo(): PeriodoResumen {
    const start = String(this.data.start_date || 'Sin definir');
    const end = String(this.data.end_date || 'Sin definir');
    const days = this.data.days ? String(this.data.days) : '—';
    return {
      principal: start,
      secundario: `${end} · ${days} días calendario`,
    };
  }

  public override getEtiquetaDuracion(): string {
    const days = this.data.days ? String(this.data.days) : '—';
    return `${days} días calendario`;
  }

  public override getTituloSeccionFinanzas(): string {
    return 'Saldo de vacaciones';
  }

  public override getSubtituloSeccionFinanzas(): string {
    return 'Días hábiles por periodo de causación. Se descuentan al expedir la resolución y nunca se editan.';
  }

  public override getIndicadoresFinancieros(): IndicadorFinanciero[] {
    const items: IndicadorFinanciero[] = [
      {
        label: 'Días hábiles solicitados',
        value: this.data.business_days ? String(this.data.business_days) : '—',
      },
      {
        label: 'Último día de disfrute',
        value: this.data.end_date ? String(this.data.end_date) : '—',
      },
      {
        label: 'Reintegro previsto',
        value: this.data.return_date ? String(this.data.return_date) : '—',
      },
      {
        label: 'Periodo asignado',
        value: this.data.period_label ? String(this.data.period_label) : '—',
      },
    ];
    if (this.data.returned_days) {
      items.push({
        label: 'Días devueltos',
        value: String(this.data.returned_days),
      });
    }
    return items;
  }

  public override getMensajeFlujoProvisional(): string {
    return 'Las responsabilidades y controles deben contrastarse con las resoluciones. Esta versión permite probar el trámite y bloquea su cierre institucional.';
  }

  public override getAvisosEtapaActual(): string[] {
    return [];
  }
}

/**
 * Patrón Factory para instanciar polimórficamente el tipo de expediente adecuado.
 */
export class ExpedienteFactory {
  public static crear(dto: CaseSummaryDTO | CaseDetailDTO): ExpedienteBase {
    const detail = 'steps' in dto ? (dto as CaseDetailDTO) : null;
    switch (dto.kind) {
      case 'incapacidad':
        return new ExpedienteIncapacidad(dto, detail);
      case 'viatico':
        return new ExpedienteViatico(dto, detail);
      case 'compensatorio':
        return new ExpedienteCompensatorio(dto, detail);
      case 'vacaciones':
        return new ExpedienteVacaciones(dto, detail);
      default:
        return new ExpedienteIncapacidad(dto, detail);
    }
  }

  public static crearLista(dtos: CaseSummaryDTO[]): ExpedienteBase[] {
    return dtos.map((d) => ExpedienteFactory.crear(d));
  }
}
