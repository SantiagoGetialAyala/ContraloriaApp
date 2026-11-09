import { ExpedienteBase, ExpedienteFactory } from '../domain/Expediente';
import type {
  CalendarDTO,
  CaseDetailDTO,
  CaseKind,
  CaseListDTO,
  DashboardDTO,
  FieldSchemaDTO,
  ProceduresDTO,
  VacationDashboardDTO,
} from '../domain/types';
import { BaseApiService } from './BaseApiService';

export interface DashboardViewModel {
  dto: DashboardDTO;
  bandeja: ExpedienteBase[];
  recientes: ExpedienteBase[];
}

export interface CaseListViewModel {
  dto: CaseListDTO;
  expedientes: ExpedienteBase[];
}

/**
 * Servicio orientado a objetos encargado del ciclo de vida de los expedientes,
 * flujos de trabajo, documentos y movimientos financieros.
 */
export class ExpedienteService extends BaseApiService {
  public async obtenerDashboard(filtros: Record<string, string> = {}): Promise<DashboardViewModel> {
    const dto = await this.http.get<DashboardDTO>('/api/dashboard/', filtros);
    return {
      dto,
      bandeja: ExpedienteFactory.crearLista(dto.tasks),
      recientes: ExpedienteFactory.crearLista(dto.recent),
    };
  }

  public async listarPorModulo(
    kind: CaseKind,
    filtros: Record<string, string> = {},
  ): Promise<CaseListViewModel> {
    const dto = await this.http.get<CaseListDTO>(`/api/cases/${kind}/`, filtros);
    return {
      dto,
      expedientes: ExpedienteFactory.crearLista(dto.cases),
    };
  }

  public async obtenerEsquemaNuevo(kind: CaseKind): Promise<{
    kind: CaseKind;
    title: string;
    fields_schema: FieldSchemaDTO[];
  }> {
    return this.http.get(`/api/cases/${kind}/`, { schema: '1' });
  }

  public async crearBorrador(
    kind: CaseKind,
    valores: Record<string, unknown>,
  ): Promise<{ expediente: ExpedienteBase; mensaje: string }> {
    const res = await this.http.post<{ case: CaseDetailDTO }>(`/api/cases/${kind}/`, {
      ...valores,
      revision: 1,
    });
    return {
      expediente: ExpedienteFactory.crear(res.data.case),
      mensaje: res.message || 'Borrador guardado.',
    };
  }

  public async obtenerDetalle(
    caseId: string,
    historyPage = 1,
  ): Promise<ExpedienteBase> {
    const dto = await this.http.get<CaseDetailDTO>(
      `/api/cases/detail/${caseId}/`,
      historyPage > 1 ? { history_page: String(historyPage) } : {},
    );
    return ExpedienteFactory.crear(dto);
  }

  public async guardarDatos(
    caseId: string,
    revision: number,
    valores: Record<string, unknown>,
  ): Promise<{ expediente: ExpedienteBase; mensaje: string }> {
    const res = await this.http.post<CaseDetailDTO>(`/api/cases/detail/${caseId}/save/`, {
      ...valores,
      revision,
    });
    return {
      expediente: ExpedienteFactory.crear(res.data),
      mensaje: res.message || 'Datos guardados.',
    };
  }

  public async ejecutarDecision(
    caseId: string,
    revision: number,
    action: 'advance' | 'return' | 'reject' | 'note',
    note: string,
  ): Promise<{ expediente: ExpedienteBase; mensaje: string }> {
    const res = await this.http.post<CaseDetailDTO>(`/api/cases/detail/${caseId}/decision/`, {
      revision,
      action,
      note,
    });
    return {
      expediente: ExpedienteFactory.crear(res.data),
      mensaje: res.message || 'Actuación registrada.',
    };
  }

  public async subirDocumento(
    caseId: string,
    revision: number,
    category: string,
    file: File,
  ): Promise<{ expediente: ExpedienteBase; mensaje: string }> {
    const fd = new FormData();
    fd.append('revision', String(revision));
    fd.append('category', category);
    fd.append('file', file);
    const res = await this.http.postFormData<CaseDetailDTO>(
      `/api/cases/detail/${caseId}/upload/`,
      fd,
    );
    return {
      expediente: ExpedienteFactory.crear(res.data),
      mensaje: res.message || 'Documento incorporado al expediente.',
    };
  }

  public async registrarPago(
    caseId: string,
    payload: {
      revision: number;
      kind: string;
      amount: string;
      paid_on: string;
      reference: string;
      evidence: number;
    },
  ): Promise<{ expediente: ExpedienteBase; mensaje: string }> {
    const res = await this.http.post<CaseDetailDTO>(
      `/api/cases/detail/${caseId}/payment/`,
      payload,
    );
    return {
      expediente: ExpedienteFactory.crear(res.data),
      mensaje: res.message || 'Movimiento financiero registrado.',
    };
  }

  public async registrarReconocimiento(
    caseId: string,
    payload: {
      revision: number;
      recognized: string;
      document_id: number;
      note: string;
    },
  ): Promise<{ expediente: ExpedienteBase; mensaje: string }> {
    const res = await this.http.post<CaseDetailDTO>(
      `/api/cases/detail/${caseId}/recognition/`,
      payload,
    );
    return {
      expediente: ExpedienteFactory.crear(res.data),
      mensaje: res.message || 'Reconocimiento actualizado.',
    };
  }

  public async registrarNovedadVacaciones(
    caseId: string,
    payload: {
      revision: number;
      kind: 'suspension' | 'aplazamiento';
      on_date: string;
      reason: string;
      document_id: number;
    },
  ): Promise<{ expediente: ExpedienteBase; mensaje: string }> {
    const res = await this.http.post<CaseDetailDTO>(
      `/api/cases/detail/${caseId}/vacation-interruption/`,
      payload,
    );
    return {
      expediente: ExpedienteFactory.crear(res.data),
      mensaje: res.message || 'Novedad registrada.',
    };
  }

  public async obtenerDashboardVacaciones(year?: number): Promise<VacationDashboardDTO> {
    return this.http.get<VacationDashboardDTO>(
      '/api/vacaciones/dashboard/',
      year ? { year: String(year) } : {},
    );
  }

  public async registrarSaldoInicialVacaciones(payload: {
    employee_id: number;
    period_number: number;
    days: number;
    note: string;
  }): Promise<string> {
    const res = await this.http.post<undefined>('/api/vacaciones/dashboard/', {
      ...payload,
      action: 'initial_balance',
    });
    return res.message || 'Saldo inicial registrado.';
  }

  public async guardarFestivoVacaciones(payload: {
    date: string;
    name: string;
  }): Promise<string> {
    const res = await this.http.post<undefined>('/api/vacaciones/dashboard/', {
      ...payload,
      action: 'save_holiday',
    });
    return res.message || 'Festivo guardado.';
  }

  public async precargarFestivosAnuales(year: number): Promise<string> {
    const res = await this.http.post<undefined>('/api/vacaciones/dashboard/', {
      year,
      action: 'load_year_holidays',
    });
    return res.message || 'Festivos precargados.';
  }

  public async obtenerCalendarioCompensatorios(): Promise<CalendarDTO> {
    return this.http.get<CalendarDTO>('/api/compensatorios/calendar/');
  }

  public async obtenerProcedimientos(): Promise<ProceduresDTO> {
    return this.http.get<ProceduresDTO>('/api/procedures/');
  }
}
