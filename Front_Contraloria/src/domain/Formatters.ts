/**
 * Clases utilitarias orientadas a objetos para el formateo de importes, fechas
 * y cálculos de negocio en tiempo real en el cliente.
 */
export class FormateadorTexto {
  public static moneda(valor: string | number | null | undefined): string {
    if (valor === null || valor === undefined || valor === '') {
      return '$ 0,00';
    }
    const numero = typeof valor === 'number' ? valor : Number(valor);
    if (Number.isNaN(numero) || !Number.isFinite(numero)) {
      return '$ 0,00';
    }
    const partes = numero.toFixed(2).split('.');
    const entero = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `$ ${entero},${partes[1]}`;
  }

  public static dosDigitos(valor: number): string {
    return String(valor).padStart(2, '0');
  }

  public static fechaCorta(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  public static fechaHora(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  public static tamanoArchivo(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
  }
}

export class CalculadoraTramite {
  /**
   * Calcula los días calendario inclusivos entre dos fechas YYYY-MM-DD.
   */
  public static calcularDiasCalendario(inicio: string, fin: string): number | null {
    if (!inicio || !fin) return null;
    const d1 = new Date(`${inicio}T00:00:00`);
    const d2 = new Date(`${fin}T00:00:00`);
    if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime()) || d2 < d1) {
      return null;
    }
    const diffMs = d2.getTime() - d1.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
  }

  /**
   * Calcula los minutos efectivos trabajados a partir de hora inicial, final y pausa.
   */
  public static calcularMinutosTrabajados(
    horaInicio: string,
    horaFin: string,
    pausaMinutos: number,
  ): number | null {
    if (!horaInicio || !horaFin) return null;
    const [h1, m1] = horaInicio.split(':').map(Number);
    const [h2, m2] = horaFin.split(':').map(Number);
    if ([h1, m1, h2, m2].some((v) => Number.isNaN(v))) return null;
    const inicioTotal = h1 * 60 + m1;
    const finTotal = h2 * 60 + m2;
    const pausa = Number.isNaN(pausaMinutos) || pausaMinutos < 0 ? 0 : pausaMinutos;
    const neto = finTotal - inicioTotal - pausa;
    return neto > 0 ? neto : null;
  }

  /**
   * Determina la entidad responsable del pago según la duración de la incapacidad
   * (Resolución 067/2025 y Art. 2.2.3.4.3 DUR 780/2016).
   */
}

