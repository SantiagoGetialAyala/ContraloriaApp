import type { VacationScheduleItemDTO } from './types';

export type ReglaCruceVacaciones = 'DEPT' | 'GLOBAL';

export interface TraslapeVacaciones {
  start: string;
  end: string;
  days: number;
}

export interface ConflictoVacaciones {
  other: ProgramacionVacacionItem;
  overlap: TraslapeVacaciones;
  isSameDept: boolean;
}

export interface CeldaCalendarioMes {
  iso: string;
  dayNum: number;
  monthIndex: number;
  monthTag: string;
  isCurrentMonth: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName: string | null;
}

export interface ResultadoSimulacionVacaciones {
  startIso: string;
  endIso: string;
  returnIso: string;
  businessDays: number;
  calendarDays: number;
  sameDeptConflicts: Array<{ other: ProgramacionVacacionItem; overlap: TraslapeVacaciones }>;
  otherDeptConflicts: Array<{ other: ProgramacionVacacionItem; overlap: TraslapeVacaciones }>;
}

/**
 * Clase POO que modela el Calendario Laboral de Colombia (Ley Emiliani)
 * y encapsula la aritmética de días hábiles y construcción de cuadrículas mensuales.
 */
export class CalendarioLaboralColombia {
  public static readonly NOMBRES_MESES = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];

  public static readonly MESES_CORTOS = [
    'Ene',
    'Feb',
    'Mar',
    'Abr',
    'May',
    'Jun',
    'Jul',
    'Ago',
    'Sep',
    'Oct',
    'Nov',
    'Dic',
  ];

  private readonly festivosMap: Map<string, string>;

  public constructor(holidaysDto: Array<{ date: string; name: string }> = []) {
    this.festivosMap = new Map<string, string>();
    for (const h of holidaysDto) {
      if (h.date && h.name) {
        this.festivosMap.set(h.date, h.name);
      }
    }
  }

  public static parseISO(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  public static toISO(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  public static formatearCorto(iso: string): string {
    if (!iso || !iso.includes('-')) return '—';
    const [, m, d] = iso.split('-').map(Number);
    const shortMonth = CalendarioLaboralColombia.MESES_CORTOS[(m || 1) - 1] || '';
    return `${d} ${shortMonth.toLowerCase()}`;
  }

  public esFestivo(iso: string): boolean {
    return this.festivosMap.has(iso);
  }

  public obtenerNombreFestivo(iso: string): string | null {
    return this.festivosMap.get(iso) || null;
  }

  public listarFestivosPorAnio(year: number): Array<{ date: string; name: string }> {
    const prefix = `${year}-`;
    const list: Array<{ date: string; name: string }> = [];
    for (const [date, name] of this.festivosMap.entries()) {
      if (date.startsWith(prefix)) {
        list.push({ date, name });
      }
    }
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }

  public esDiaHabil(date: Date): boolean {
    const dow = date.getDay();
    if (dow === 0 || dow === 6) return false;
    return !this.esFestivo(CalendarioLaboralColombia.toISO(date));
  }

  public calcularFechaFinHabil(startIso: string, businessDays: number): string {
    if (!startIso) return '';
    const cur = CalendarioLaboralColombia.parseISO(startIso);
    let count = 0;
    const target = Math.max(1, businessDays);
    let safety = 0;
    while (count < target && safety < 120) {
      if (this.esDiaHabil(cur)) {
        count++;
      }
      if (count < target) {
        cur.setDate(cur.getDate() + 1);
      }
      safety++;
    }
    return CalendarioLaboralColombia.toISO(cur);
  }

  public calcularSiguienteDiaHabil(endIso: string): string {
    if (!endIso) return '';
    const cur = CalendarioLaboralColombia.parseISO(endIso);
    cur.setDate(cur.getDate() + 1);
    let safety = 0;
    while (!this.esDiaHabil(cur) && safety < 30) {
      cur.setDate(cur.getDate() + 1);
      safety++;
    }
    return CalendarioLaboralColombia.toISO(cur);
  }

  public construirCeldasMes(year: number, monthIndex: number): CeldaCalendarioMes[] {
    const firstOfMonth = new Date(year, monthIndex, 1);
    const startOffset = (firstOfMonth.getDay() + 6) % 7; // Lunes = 0
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const totalCells = startOffset + daysInMonth > 35 ? 42 : 35;
    const gridStartDate = new Date(year, monthIndex, 1 - startOffset);

    const cells: CeldaCalendarioMes[] = [];
    for (let i = 0; i < totalCells; i++) {
      const cellDate = new Date(gridStartDate);
      cellDate.setDate(gridStartDate.getDate() + i);
      const iso = CalendarioLaboralColombia.toISO(cellDate);
      const cellMonth = cellDate.getMonth();
      const dayNum = cellDate.getDate();
      const dow = cellDate.getDay();
      const monthTag =
        dayNum === 1 || i === 0
          ? ` ${CalendarioLaboralColombia.MESES_CORTOS[cellMonth].toLowerCase()}`
          : '';
      const holidayName = this.obtenerNombreFestivo(iso);

      cells.push({
        iso,
        dayNum,
        monthIndex: cellMonth,
        monthTag,
        isCurrentMonth: cellMonth === monthIndex,
        isWeekend: dow === 0 || dow === 6,
        isHoliday: holidayName !== null,
        holidayName,
      });
    }
    return cells;
  }
}

/**
 * Entidad POO que representa un registro de programación de vacaciones de un funcionario.
 */
export class ProgramacionVacacionItem {
  private readonly dto: VacationScheduleItemDTO;

  public constructor(dto: VacationScheduleItemDTO) {
    this.dto = dto;
  }

  public get id(): string {
    return this.dto.id;
  }

  public get caseId(): string | null {
    return this.dto.case_id;
  }

  public get reference(): string {
    return this.dto.reference;
  }

  public get employeeId(): number {
    return this.dto.employee_id;
  }

  public get name(): string {
    return this.dto.name;
  }

  public get role(): string {
    return this.dto.role;
  }

  public get dept(): string {
    return this.dto.dept;
  }

  public get start(): string {
    return this.dto.start;
  }

  public get end(): string {
    return this.dto.end;
  }

  public get returnDate(): string {
    return this.dto.return_date;
  }

  public get businessDays(): number {
    return this.dto.business_days;
  }

  public get calendarDays(): number {
    return this.dto.calendar_days;
  }

  public get stage(): string {
    return this.dto.stage;
  }

  public get stageLabel(): string {
    return this.dto.stage_label;
  }

  public get status(): 'concedida' | 'en_tramite' | 'suspendida' | 'sin_programar' {
    return this.dto.status;
  }

  public get periodLabel(): string {
    return this.dto.period_label;
  }

  public get balanceDays(): number {
    return this.dto.balance_days;
  }

  public tieneFechas(): boolean {
    return Boolean(this.start && this.end);
  }

  public getMesInicio(): number {
    if (!this.start) return 0;
    return CalendarioLaboralColombia.parseISO(this.start).getMonth();
  }

  public getMesFin(): number {
    if (!this.end) return 0;
    return CalendarioLaboralColombia.parseISO(this.end).getMonth();
  }

  public getRangoCorto(): string {
    if (!this.tieneFechas()) return 'Sin programar';
    return `${CalendarioLaboralColombia.formatearCorto(this.start)} – ${CalendarioLaboralColombia.formatearCorto(this.end)}`;
  }

  public getEtiquetaEstado(): string {
    switch (this.status) {
      case 'concedida':
        return 'Concedida';
      case 'suspendida':
        return 'Suspendida';
      case 'en_tramite':
        return 'En trámite';
      default:
        return 'Sin programar';
    }
  }

  public tocaMes(year: number, monthIndex: number): boolean {
    if (!this.tieneFechas()) return false;
    const mStart = CalendarioLaboralColombia.toISO(new Date(year, monthIndex, 1));
    const mEnd = CalendarioLaboralColombia.toISO(new Date(year, monthIndex + 1, 0));
    return this.start <= mEnd && this.end >= mStart;
  }

  public estaActivaEnFecha(iso: string): boolean {
    if (!this.tieneFechas()) return false;
    return iso >= this.start && iso <= this.end;
  }

  public calcularPosicionAnual(year: number): { leftPct: number; widthPct: number } {
    if (!this.tieneFechas()) return { leftPct: 0, widthPct: 0 };
    const startYear = new Date(year, 0, 1);
    const totalDays = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
    const sDate = CalendarioLaboralColombia.parseISO(this.start);
    const eDate = CalendarioLaboralColombia.parseISO(this.end);
    const startOffset = Math.max(0, Math.round((sDate.getTime() - startYear.getTime()) / 86400000));
    const endOffset = Math.min(
      totalDays - 1,
      Math.round((eDate.getTime() - startYear.getTime()) / 86400000),
    );
    const leftPct = (startOffset / totalDays) * 100;
    const widthPct = Math.max(4.5, ((endOffset - startOffset + 1) / totalDays) * 100);
    return { leftPct, widthPct };
  }
}

/**
 * Motor POO para detección de cruces/traslapes y simulación de vacaciones.
 */
export class AnalizadorCrucesVacaciones {
  public static calcularTraslape(
    aStart: string,
    aEnd: string,
    bStart: string,
    bEnd: string,
  ): TraslapeVacaciones | null {
    if (!aStart || !aEnd || !bStart || !bEnd) return null;
    const start = aStart > bStart ? aStart : bStart;
    const end = aEnd < bEnd ? aEnd : bEnd;
    if (start > end) return null;
    const sDate = CalendarioLaboralColombia.parseISO(start);
    const eDate = CalendarioLaboralColombia.parseISO(end);
    const days = Math.round((eDate.getTime() - sDate.getTime()) / 86400000) + 1;
    return { start, end, days };
  }

  public static obtenerConflictosDe(
    target: ProgramacionVacacionItem,
    todos: ProgramacionVacacionItem[],
    regla: ReglaCruceVacaciones,
  ): ConflictoVacaciones[] {
    if (!target.tieneFechas()) return [];
    const conflicts: ConflictoVacaciones[] = [];
    for (const other of todos) {
      if (other.id === target.id || !other.tieneFechas()) continue;
      const overlap = AnalizadorCrucesVacaciones.calcularTraslape(
        target.start,
        target.end,
        other.start,
        other.end,
      );
      if (overlap) {
        const isSameDept = other.dept === target.dept;
        if (regla === 'GLOBAL' || isSameDept) {
          conflicts.push({ other, overlap, isSameDept });
        }
      }
    }
    return conflicts;
  }

  public static contarParesEnConflicto(
    todos: ProgramacionVacacionItem[],
    regla: ReglaCruceVacaciones,
  ): number {
    let pairs = 0;
    for (const item of todos) {
      pairs += AnalizadorCrucesVacaciones.obtenerConflictosDe(item, todos, regla).length;
    }
    return Math.floor(pairs / 2);
  }

  public static simularProgramacion(
    employeeId: number,
    dept: string,
    startIso: string,
    businessDays: number,
    todos: ProgramacionVacacionItem[],
    calendario: CalendarioLaboralColombia,
  ): ResultadoSimulacionVacaciones {
    const endIso = calendario.calcularFechaFinHabil(startIso, businessDays);
    const returnIso = calendario.calcularSiguienteDiaHabil(endIso);
    const sDate = CalendarioLaboralColombia.parseISO(startIso);
    const eDate = CalendarioLaboralColombia.parseISO(endIso);
    const calendarDays = Math.max(1, Math.round((eDate.getTime() - sDate.getTime()) / 86400000) + 1);

    const sameDeptConflicts: Array<{ other: ProgramacionVacacionItem; overlap: TraslapeVacaciones }> = [];
    const otherDeptConflicts: Array<{ other: ProgramacionVacacionItem; overlap: TraslapeVacaciones }> = [];

    for (const other of todos) {
      if (other.employeeId === employeeId || !other.tieneFechas()) continue;
      const overlap = AnalizadorCrucesVacaciones.calcularTraslape(
        startIso,
        endIso,
        other.start,
        other.end,
      );
      if (overlap) {
        if (other.dept === dept) {
          sameDeptConflicts.push({ other, overlap });
        } else {
          otherDeptConflicts.push({ other, overlap });
        }
      }
    }

    return {
      startIso,
      endIso,
      returnIso,
      businessDays,
      calendarDays,
      sameDeptConflicts,
      otherDeptConflicts,
    };
  }
}
