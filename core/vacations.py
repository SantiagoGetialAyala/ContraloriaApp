"""Reglas de vacaciones: festivos, días hábiles, periodos de causación, saldos y alertas.

Supuestos por confirmar con Talento Humano (Decreto 1045 de 1978, extendido por el Decreto 1919 de 2002):
15 días hábiles por año de servicio, sábados y domingos no hábiles, prescripción a los 4 años de causado
el periodo y los días pendientes de un periodo se programan antes de usar el siguiente.
"""
from datetime import date, timedelta
from django.core.exceptions import ValidationError
from django.db.models import Q, Sum
from django.utils import timezone
from .models import Case, Holiday, VacationLedgerEntry, VacationPeriod

DAYS_PER_PERIOD = 15
PRESCRIPTION_YEARS = 4
MAX_ACCUMULATED_PERIODS = 2
UPCOMING_ALERT_DAYS = 15
RETURN_ALERT_DAYS = 3
PRESCRIPTION_ALERT_DAYS = 180
TERMINAL = {'cerrado', 'rechazado'}


# --- Festivos -----------------------------------------------------------------------------------

def easter_sunday(year):
    """Domingo de Pascua (algoritmo gregoriano anónimo)."""
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = (h + l - 7 * m + 114) % 31 + 1
    return date(year, month, day)


def _next_monday(day):
    return day + timedelta(days=(7 - day.weekday()) % 7)


def colombian_holidays(year):
    """Festivos de Colombia (Ley 51 de 1983, «Ley Emiliani»). Devuelve [(fecha, nombre)] ordenado.

    Talento Humano puede corregir la tabla de festivos; esta función solo la precarga.
    """
    easter = easter_sunday(year)
    fixed = [((1, 1), 'Año Nuevo'), ((5, 1), 'Día del Trabajo'), ((7, 20), 'Día de la Independencia'),
             ((8, 7), 'Batalla de Boyacá'), ((12, 8), 'La Inmaculada Concepción'), ((12, 25), 'Navidad')]
    moved = [((1, 6), 'Día de los Reyes Magos'), ((3, 19), 'Día de San José'), ((6, 29), 'San Pedro y San Pablo'),
             ((8, 15), 'La Asunción'), ((10, 12), 'Día de la Raza'), ((11, 1), 'Día de Todos los Santos'),
             ((11, 11), 'Independencia de Cartagena')]
    if year >= 2026:
        moved.append(((7, 9), 'Nuestra Señora del Rosario de Chiquinquirá'))
    result = {}

    def add(day, name):
        result[day] = f"{result[day]}; {name}" if day in result else name

    for (month, day), name in fixed:
        add(date(year, month, day), name)
    for (month, day), name in moved:
        add(_next_monday(date(year, month, day)), name)
    add(easter - timedelta(days=3), 'Jueves Santo')
    add(easter - timedelta(days=2), 'Viernes Santo')
    add(easter + timedelta(days=43), 'Ascensión del Señor')
    add(easter + timedelta(days=64), 'Corpus Christi')
    add(easter + timedelta(days=71), 'Sagrado Corazón')
    return sorted(result.items())


def load_holidays(year):
    """Registra los festivos calculados de un año sin modificar los que ya existan. Devuelve los creados."""
    created = 0
    for day, name in colombian_holidays(year):
        _, was_created = Holiday.objects.get_or_create(date=day, defaults={'name': name})
        created += was_created
    return created


def holidays_between(first, last):
    """Festivos registrados entre dos fechas. Exige que cada año involucrado tenga festivos cargados."""
    covered = set(Holiday.objects.filter(date__year__gte=first.year, date__year__lte=last.year).dates('date', 'year'))
    missing = [y for y in range(first.year, last.year + 1) if date(y, 1, 1) not in covered]
    if missing:
        raise ValidationError('No hay festivos registrados para ' + ', '.join(map(str, missing)) + '. Talento Humano debe cargarlos antes de programar vacaciones (python manage.py cargar_festivos <año>).')
    return set(Holiday.objects.filter(date__range=(first, last)).values_list('date', flat=True))


# --- Días hábiles -------------------------------------------------------------------------------

def is_business_day(day, holidays):
    return day.weekday() < 5 and day not in holidays


def add_business_days(start, days):
    """Último día de disfrute contando `days` hábiles desde `start`, incluido."""
    if days < 1:
        raise ValidationError('Los días hábiles deben ser al menos uno.')
    # 15 hábiles nunca superan ~25 calendario; el margen cubre fines de año con muchos festivos.
    holidays = holidays_between(start, start + timedelta(days=days * 2 + 15))
    if not is_business_day(start, holidays):
        raise ValidationError('Las vacaciones deben iniciar en un día hábil (no sábado, domingo ni festivo).')
    current, counted = start, 0
    while True:
        if is_business_day(current, holidays):
            counted += 1
            if counted == days:
                return current
        current += timedelta(days=1)


def count_business_days(first, last):
    if last < first:
        return 0
    holidays = holidays_between(first, last)
    return sum(1 for n in range((last - first).days + 1) if is_business_day(first + timedelta(days=n), holidays))


def next_business_day(day):
    holidays = holidays_between(day, day + timedelta(days=15))
    current = day + timedelta(days=1)
    while not is_business_day(current, holidays):
        current += timedelta(days=1)
    return current


# --- Periodos y saldos --------------------------------------------------------------------------

def add_years(day, years):
    try:
        return day.replace(year=day.year + years)
    except ValueError:  # 29 de febrero: el aniversario es el 1 de marzo y el periodo dura un año completo
        return date(day.year + years, 3, 1)


def check_eligible(employee):
    profile = getattr(employee, 'profile', None)
    if not profile or profile.employment != 'funcionario':
        raise ValidationError('Las vacaciones aplican a funcionarios; los contratistas no tienen este derecho.')
    if not profile.hire_date:
        raise ValidationError('Talento Humano debe registrar la fecha de ingreso del funcionario para calcular sus periodos.')
    return profile


def sync_periods(employee, today=None):
    """Crea los periodos ya causados. Ajusta fechas de periodos sin movimientos si cambió la fecha de ingreso."""
    profile = check_eligible(employee)
    today = today or timezone.localdate()
    number = 1
    while True:
        service_from = add_years(profile.hire_date, number - 1)
        service_to = add_years(profile.hire_date, number) - timedelta(days=1)
        if service_to >= today:
            break
        period, created = VacationPeriod.objects.get_or_create(employee=employee, number=number, defaults={'service_from': service_from, 'service_to': service_to, 'entitled_days': DAYS_PER_PERIOD})
        if not created and (period.service_from, period.service_to) != (service_from, service_to) and not period.entries.exists():
            period.service_from, period.service_to = service_from, service_to
            period.save(update_fields=['service_from', 'service_to'])
        number += 1
    return list(VacationPeriod.objects.filter(employee=employee).order_by('number'))


def period_balance(period):
    sums = {row['kind']: row['total'] for row in period.entries.values('kind').annotate(total=Sum('days'))}
    return period.entitled_days - sums.get('disfrute', 0) - sums.get('carga_inicial', 0) + sums.get('devolucion', 0)


def prescribes_on(period):
    return add_years(period.service_to, PRESCRIPTION_YEARS)


def reserved_days(period, exclude_case=None):
    """Días de solicitudes abiertas asignadas al periodo que aún no generan movimiento."""
    open_cases = Case.objects.filter(kind='vacaciones', data__period_id=period.pk).exclude(stage__in=TERMINAL).exclude(vacation_entries__kind='disfrute')
    if exclude_case is not None:
        open_cases = open_cases.exclude(pk=exclude_case.pk)
    return sum(int(c.data.get('business_days') or 0) for c in open_cases.only('data'))


def period_summary(employee, today=None):
    today = today or timezone.localdate()
    rows = []
    for period in sync_periods(employee, today):
        balance = period_balance(period)
        rows.append({'period': period, 'balance': balance, 'reserved': reserved_days(period), 'prescribes_on': prescribes_on(period), 'prescribed': prescribes_on(period) < today})
    return rows


def assign_period(case, today=None):
    """Asigna el periodo más antiguo con días disponibles y valida que alcance para la solicitud."""
    requested = int(case.data.get('business_days') or 0)
    for row in period_summary(case.owner, today):
        if row['prescribed'] or row['balance'] <= 0:
            continue
        free = row['balance'] - reserved_days(row['period'], exclude_case=case)
        if free <= 0:
            continue
        if requested > free:
            raise ValidationError(f"El {row['period'].label} tiene {free} días hábiles disponibles. Programe primero esos días antes de usar el siguiente periodo.")
        return row['period']
    raise ValidationError('El funcionario no tiene periodos causados con días disponibles.')


# --- Planeación de una solicitud ----------------------------------------------------------------

def _interval(case):
    start, end = case.data.get('start_date'), case.data.get('end_date')
    return (date.fromisoformat(start), date.fromisoformat(end)) if start and end else (None, None)


def check_conflicts(case, first, last):
    """Bloquea cruces con otras vacaciones, incapacidades, comisiones o compensatorios del mismo funcionario."""
    others = Case.objects.filter(owner=case.owner).exclude(pk=case.pk).exclude(stage='rechazado')
    labels = {'vacaciones': 'otras vacaciones', 'incapacidad': 'una incapacidad', 'viatico': 'una comisión', 'compensatorio': 'un compensatorio'}
    for other in others.only('kind', 'data', 'id'):
        data = other.data
        if other.kind == 'compensatorio':
            a, b = data.get('request_start_date'), data.get('request_end_date')
        else:
            a, b = data.get('start_date'), data.get('end_date')
        if other.kind == 'vacaciones' and data.get('interruption_kind') == 'aplazamiento':
            continue
        if a and b and a <= last.isoformat() and first.isoformat() <= b:
            raise ValidationError(f"Las fechas se cruzan con {labels[other.kind]} registrada ({other.reference}: {a} a {b}).")


def plan_case(case, strict=False):
    """Calcula fechas, asigna periodo y valida cruces. No recalcula una solicitud ya concedida."""
    data = case.data
    if not case._state.adding and case.vacation_entries.filter(kind='disfrute').exists():
        return
    check_eligible(case.owner)
    start, days = data.get('start_date'), data.get('business_days')
    if not start or not days:
        if strict:
            raise ValidationError('Indique la fecha de inicio y los días hábiles a disfrutar.')
        return
    days = int(days)
    if not 1 <= days <= DAYS_PER_PERIOD:
        raise ValidationError(f'Los días hábiles deben estar entre 1 y {DAYS_PER_PERIOD}.')
    first = date.fromisoformat(start)
    last = add_business_days(first, days)
    period = assign_period(case)
    data.update({
        'end_date': last.isoformat(),
        'return_date': next_business_day(last).isoformat(),
        'days': (last - first).days + 1,
        'period_id': period.pk,
        'period_label': period.label,
    })
    check_conflicts(case, first, last)


# --- Recordatorios ------------------------------------------------------------------------------

def is_superior(user, employee):
    """Jefe de la dependencia del funcionario; si no hay otro jefe, lo es la autoridad competente."""
    from .workflows import role_names
    if not user.is_authenticated or user.pk == employee.pk:
        return False
    dependencia = getattr(getattr(employee, 'profile', None), 'dependencia', None)
    if dependencia and dependencia.jefe_id and dependencia.jefe_id != employee.pk:
        return user.pk == dependencia.jefe_id
    return 'autoridad' in role_names(user)


def alerts(user, cases, today=None):
    """Alertas del panel a partir de los expedientes visibles para el usuario."""
    from .workflows import role_names
    today = today or timezone.localdate()
    roles = role_names(user)
    result = []
    for case in cases:
        if case.kind != 'vacaciones' or case.stage in TERMINAL:
            continue
        concerned = case.owner_id == user.pk or 'talento' in roles or is_superior(user, case.owner)
        start, _ = _interval(case)
        if not concerned or not start:
            continue
        granted = case.stage == 'disfrute'
        if granted and today <= start <= today + timedelta(days=UPCOMING_ALERT_DAYS):
            who = 'Sus vacaciones' if case.owner_id == user.pk else f'Vacaciones de {case.owner.get_full_name() or case.owner.username}'
            result.append({'case': case, 'label': f'{who} inician en {(start - today).days} día(s)', 'date': start})
        returns = case.data.get('return_date')
        if granted and returns and today <= date.fromisoformat(returns) <= today + timedelta(days=RETURN_ALERT_DAYS):
            result.append({'case': case, 'label': f'Reintegro previsto de {case.owner.get_full_name() or case.owner.username}', 'date': date.fromisoformat(returns)})
    from django.contrib.auth.models import User
    employees = User.objects.filter(is_active=True, profile__employment='funcionario', profile__hire_date__isnull=False)
    if 'talento' not in roles:
        employees = employees.filter(Q(pk=user.pk) | Q(profile__dependencia__jefe=user))
    for employee in employees.select_related('profile'):
        rows = [r for r in period_summary(employee, today) if r['balance'] > 0 and not r['prescribed']]
        name = 'Usted' if employee.pk == user.pk else (employee.get_full_name() or employee.username)
        if len(rows) >= MAX_ACCUMULATED_PERIODS:
            result.append({'case': None, 'label': f'{name}: {len(rows)} periodos de vacaciones acumulados', 'date': today})
        for row in rows:
            if row['prescribes_on'] <= today + timedelta(days=PRESCRIPTION_ALERT_DAYS):
                result.append({'case': None, 'label': f"{name}: el {row['period'].label} prescribe con {row['balance']} días pendientes", 'date': row['prescribes_on']})
    return result
