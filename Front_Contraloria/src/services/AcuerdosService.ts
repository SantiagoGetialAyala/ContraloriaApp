import type { AcuerdosTableroDTO, EvidenciaSindicalDTO } from '../domain/types';
import { BaseApiService } from './BaseApiService';

export interface CumplimientoPayload {
  punto_id?: number;
  estado: 'en_tramite' | 'cumplido' | 'no_cumplido';
  fecha: string;
  descripcion: string;
  beneficiarios: number[];
}

/**
 * Servicio de acuerdos sindicales: tablero de seguimiento, registros de cumplimiento y evidencias.
 * Las evidencias no se pueden borrar desde la aplicación.
 */
export class AcuerdosService extends BaseApiService {
  public async obtenerTablero(anio: number): Promise<AcuerdosTableroDTO> {
    return this.http.get<AcuerdosTableroDTO>('/api/acuerdos-sindicales/', { anio: String(anio) });
  }

  public async crearCumplimiento(payload: CumplimientoPayload): Promise<string> {
    const res = await this.http.post<{ id: number }>('/api/acuerdos-sindicales/cumplimientos/', { ...payload });
    return res.message || 'Registro guardado.';
  }

  public async actualizarCumplimiento(id: number, payload: CumplimientoPayload): Promise<string> {
    const res = await this.http.post<undefined>(`/api/acuerdos-sindicales/cumplimientos/${id}/`, { ...payload });
    return res.message || 'Registro actualizado.';
  }

  public async adjuntarEvidencia(cumplimientoId: number, tipo: string, archivo: File, titulo = ''): Promise<string> {
    const fd = new FormData();
    fd.append('tipo', tipo);
    fd.append('titulo', titulo);
    fd.append('file', archivo);
    const res = await this.http.postFormData<EvidenciaSindicalDTO>(
      `/api/acuerdos-sindicales/cumplimientos/${cumplimientoId}/evidencias/`,
      fd,
    );
    return res.message || 'Documento adjuntado.';
  }

  public async adjuntarDocumentoAcuerdo(acuerdoId: number, archivo: File, titulo = ''): Promise<string> {
    const fd = new FormData();
    fd.append('tipo', 'acuerdo_firmado');
    fd.append('titulo', titulo);
    fd.append('file', archivo);
    const res = await this.http.postFormData<EvidenciaSindicalDTO>(
      `/api/acuerdos-sindicales/${acuerdoId}/documentos/`,
      fd,
    );
    return res.message || 'Documento del acuerdo adjuntado.';
  }
}
