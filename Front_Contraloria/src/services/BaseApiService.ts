import type { HttpClient } from './HttpClient';

/**
 * Clase base abstracta para los servicios de comunicación con el backend.
 */
export abstract class BaseApiService {
  protected readonly http: HttpClient;

  public constructor(http: HttpClient) {
    this.http = http;
  }
}

