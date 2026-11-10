import type {
  AuditLogDTO,
  ConfigurationDTO,
  EmployeeDocumentDTO,
  HojaDeVidaDetailDTO,
  HojasDeVidaDirectoryDTO,
  UsersDirectoryDTO,
} from '../domain/types';
import { BaseApiService } from './BaseApiService';

/**
 * Servicio orientado a objetos para la administración institucional:
 * parámetros normativos, escalas de viáticos, usuarios/roles y auditoría.
 */
export class AdminService extends BaseApiService {
  public async obtenerConfiguracion(): Promise<ConfigurationDTO> {
    return this.http.get<ConfigurationDTO>('/api/configuration/');
  }

  public async registrarPolitica(payload: {
    kind: string;
    source: string;
    source_pages: string;
    approval_reference: string;
    config: string;
    confirmed: boolean;
  }): Promise<string> {
    const res = await this.http.post<undefined>('/api/configuration/', {
      ...payload,
      form_type: 'policy',
    });
    return res.message || 'Versión aprobada.';
  }

  public async registrarEscala(payload: {
    name: string;
    category: string;
    destination: string;
    valid_from: string;
    valid_until: string;
    overnight_rate: string;
    day_rate: string;
    source: string;
    approval_reference: string;
  }): Promise<string> {
    const res = await this.http.post<undefined>('/api/configuration/', {
      ...payload,
      form_type: 'scale',
    });
    return res.message || 'Escala registrada.';
  }

  public async listarUsuarios(): Promise<UsersDirectoryDTO> {
    return this.http.get<UsersDirectoryDTO>('/api/users/');
  }

  public async crearUsuario(payload: {
    name: string;
    username: string;
    department: string;
    employment: string;
    password: string;
    password_confirm: string;
    roles: string[];
    cedula?: string;
    cargo?: string;
    codigo?: string;
    grado?: string;
    hire_date?: string;
    is_jefe?: boolean;
  }): Promise<string> {
    const res = await this.http.post<undefined>('/api/users/', payload);
    return res.message || 'Usuario creado.';
  }

  public async actualizarAccesoUsuario(
    userId: number,
    payload: {
      roles: string[];
      active: boolean;
      password?: string;
      department?: string;
      employment?: string;
      cedula?: string;
      cargo?: string;
      codigo?: string;
      grado?: string;
      hire_date?: string;
      is_jefe?: boolean;
    },
  ): Promise<string> {
    const res = await this.http.post<undefined>(`/api/users/${userId}/`, payload);
    return res.message || 'Acceso actualizado.';
  }

  public async obtenerAuditoria(page = 1): Promise<AuditLogDTO> {
    return this.http.get<AuditLogDTO>(
      '/api/audit/',
      page > 1 ? { page: String(page) } : {},
    );
  }

  public async listarHojasDeVida(): Promise<HojasDeVidaDirectoryDTO> {
    return this.http.get<HojasDeVidaDirectoryDTO>('/api/hojas-de-vida/');
  }

  public async crearPersonaHojaDeVida(
    formData: FormData,
  ): Promise<{ user_id: number; message: string }> {
    const res = await this.http.postFormData<{ user_id: number }>(
      '/api/hojas-de-vida/',
      formData,
    );
    return {
      user_id: res.data.user_id,
      message: res.message || 'Persona creada correctamente.',
    };
  }

  public async obtenerHojaDeVida(userId: number): Promise<HojaDeVidaDetailDTO> {
    return this.http.get<HojaDeVidaDetailDTO>(`/api/hojas-de-vida/${userId}/`);
  }

  public async actualizarHojaDeVida(
    userId: number,
    payload: Record<string, unknown>,
  ): Promise<string> {
    const res = await this.http.post<undefined>(`/api/hojas-de-vida/${userId}/`, payload);
    return res.message || 'Datos de la hoja de vida actualizados.';
  }

  public async subirDocumentoHojaDeVida(
    userId: number,
    formData: FormData,
  ): Promise<{ doc: EmployeeDocumentDTO; message: string }> {
    const res = await this.http.postFormData<EmployeeDocumentDTO>(
      `/api/hojas-de-vida/${userId}/documentos/`,
      formData,
    );
    return {
      doc: res.data,
      message: res.message || 'Documento incorporado a la hoja de vida.',
    };
  }

  public async eliminarDocumentoHojaDeVida(
    userId: number,
    documentId: number,
  ): Promise<string> {
    const res = await this.http.post<undefined>(
      `/api/hojas-de-vida/${userId}/documentos/${documentId}/eliminar/`,
    );
    return res.message || 'Documento eliminado.';
  }
}
