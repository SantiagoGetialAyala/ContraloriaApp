import type {
  AuditLogDTO,
  ConfigurationDTO,
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
}
