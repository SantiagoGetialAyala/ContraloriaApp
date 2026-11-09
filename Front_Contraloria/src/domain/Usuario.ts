import type { UserDTO } from './types';

/**
 * Modelo de dominio orientado a objetos que encapsula al usuario autenticado,
 * su perfil institucional y sus privilegios de acceso y navegación.
 */
export class UsuarioSesion {
  private readonly dto: UserDTO;

  public constructor(dto: UserDTO) {
    this.dto = dto;
  }

  public get id(): number {
    return this.dto.id;
  }

  public get username(): string {
    return this.dto.username;
  }

  public get nombreCompleto(): string {
    return this.dto.full_name || this.dto.username;
  }

  public get dependencia(): string {
    return this.dto.department;
  }

  public get vinculacion(): string {
    return this.dto.employment;
  }

  public get roles(): ReadonlyArray<string> {
    return this.dto.roles;
  }

  public get etiquetasRol(): ReadonlyArray<string> {
    return this.dto.role_labels;
  }

  public esAdministrador(): boolean {
    return this.dto.nav_admin;
  }

  public esAutoridad(): boolean {
    return this.dto.nav_authority;
  }

  public puedeVerAdministracion(): boolean {
    return this.dto.nav_admin || this.dto.nav_authority || this.dto.can_configure;
  }

  public puedeConfigurarNormativa(): boolean {
    return this.dto.can_configure;
  }

  public tieneRol(rol: string): boolean {
    return this.dto.roles.includes(rol);
  }

  public getInicialAvatar(): string {
    const base = this.dto.full_name || this.dto.username || 'U';
    return base.slice(0, 1).toUpperCase();
  }
}

