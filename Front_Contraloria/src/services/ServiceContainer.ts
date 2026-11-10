import { NavigationController } from '../domain/NavigationController';
import { AdminService } from './AdminService';
import { AuthService } from './AuthService';
import { ExpedienteService } from './ExpedienteService';
import { HttpClient } from './HttpClient';

/**
 * Contenedor Singleton orientado a objetos que centraliza e inyecta
 * las dependencias de servicios y navegación de la aplicación.
 */
export class ServiceContainer {
  private static instance: ServiceContainer | null = null;

  public readonly http: HttpClient;
  public readonly auth: AuthService;
  public readonly expedientes: ExpedienteService;
  public readonly admin: AdminService;
  public readonly navigation: NavigationController;

  private constructor() {
    this.http = new HttpClient('');
    this.auth = new AuthService(this.http);
    this.expedientes = new ExpedienteService(this.http);
    this.admin = new AdminService(this.http);
    this.navigation = new NavigationController();
  }

  public static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer();
    }
    return ServiceContainer.instance;
  }
}

export const appServices = ServiceContainer.getInstance();

