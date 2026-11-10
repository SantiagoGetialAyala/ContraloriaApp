import { UsuarioSesion } from '../domain/Usuario';
import type { SessionDTO } from '../domain/types';
import { BaseApiService } from './BaseApiService';

export interface EstadoSesionModel {
  autenticado: boolean;
  requiereConfiguracionInicial: boolean;
  usuario: UsuarioSesion | null;
}

/**
 * Servicio orientado a objetos para la gestión de sesiones, alta inicial y credenciales.
 */
export class AuthService extends BaseApiService {
  private pendingSession: Promise<EstadoSesionModel> | null = null;

  public obtenerSesion(): Promise<EstadoSesionModel> {
    if (!this.pendingSession) {
      this.pendingSession = this.http.get<SessionDTO>('/api/session/').then((dto) => ({
        autenticado: dto.authenticated,
        requiereConfiguracionInicial: dto.needs_setup,
        usuario: dto.user ? new UsuarioSesion(dto.user) : null,
      })).finally(() => { this.pendingSession = null; });
    }
    return this.pendingSession;
  }

  public async configurarAdministradorInicial(payload: {
    name: string;
    username: string;
    department: string;
    password: string;
    password_confirm: string;
  }): Promise<string> {
    const res = await this.http.post<undefined>('/api/auth/setup/', payload);
    return res.message || 'Administrador inicial creado.';
  }

  public async iniciarSesion(payload: {
    username: string;
    password: string;
  }): Promise<string> {
    const res = await this.http.post<undefined>('/api/auth/login/', payload);
    return res.message || 'Sesión iniciada.';
  }

  public async cerrarSesion(): Promise<string> {
    const res = await this.http.post<undefined>('/api/auth/logout/');
    return res.message || 'Sesión cerrada.';
  }

  public async cambiarClave(payload: {
    old_password: string;
    new_password1: string;
    new_password2: string;
  }): Promise<string> {
    const res = await this.http.post<undefined>('/api/auth/password/', payload);
    return res.message || 'Contraseña actualizada.';
  }
}

