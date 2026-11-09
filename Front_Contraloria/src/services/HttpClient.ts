export interface ApiSuccessPayload<T> {
  ok: true;
  message?: string;
  data?: T;
}

export interface ApiErrorPayload {
  ok: false;
  errors?: string[];
  field_errors?: Record<string, string[]>;
}

/**
 * Excepción orientada a objetos para representar errores devueltos por la API de Django.
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly errors: string[];
  public readonly fieldErrors: Record<string, string[]>;

  public constructor(
    status: number,
    errors: string[],
    fieldErrors: Record<string, string[]> = {},
  ) {
    super(errors[0] || 'Ocurrió un error al procesar la solicitud.');
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors.length > 0 ? errors : ['Ocurrió un error al procesar la solicitud.'];
    this.fieldErrors = fieldErrors;
  }
}

/**
 * Cliente HTTP orientado a objetos con manejo automático de sesión y CSRF de Django.
 */
export class HttpClient {
  private readonly baseUrl: string;

  public constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  private getCsrfToken(): string {
    if (typeof document === 'undefined') return '';
    const match = document.cookie
      .split('; ')
      .find((row) => row.startsWith('csrftoken='));
    return match ? decodeURIComponent(match.split('=')[1]) : '';
  }

  private async handleResponse<T>(response: Response): Promise<{ data: T; message?: string }> {
    let json: ApiSuccessPayload<T> | ApiErrorPayload | null = null;
    try {
      json = await response.json();
    } catch {
      throw new ApiError(response.status, [
        `Error de comunicación con el servidor (HTTP ${response.status}).`,
      ]);
    }
    if (!response.ok || !json || json.ok === false) {
      const errPayload = json as ApiErrorPayload | null;
      throw new ApiError(
        response.status,
        errPayload?.errors || ['La operación fue rechazada por el servidor.'],
        errPayload?.field_errors || {},
      );
    }
    return {
      data: (json as ApiSuccessPayload<T>).data as T,
      message: (json as ApiSuccessPayload<T>).message,
    };
  }

  public async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const search = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') {
          search.set(k, v);
        }
      }
      const qs = search.toString();
      if (qs) {
        url += (url.includes('?') ? '&' : '?') + qs;
      }
    }
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
      },
    });
    const result = await this.handleResponse<T>(response);
    return result.data;
  }

  public async post<T>(
    path: string,
    body: Record<string, unknown> = {},
  ): Promise<{ data: T; message?: string }> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRFToken': this.getCsrfToken(),
      },
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response);
  }

  public async postFormData<T>(
    path: string,
    formData: FormData,
  ): Promise<{ data: T; message?: string }> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'X-CSRFToken': this.getCsrfToken(),
      },
      body: formData,
    });
    return this.handleResponse<T>(response);
  }
}

