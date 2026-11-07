import hashlib
import os
from datetime import date, time, timedelta
from decimal import Decimal, InvalidOperation
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from django.utils.text import get_valid_filename
from .models import Case, CompensatoryLedgerEntry, Dependencia, Document, Event, FinancialEntry, PolicyVersion, TravelScale, VacationLedgerEntry, VacationPeriod
from .forms import BASE_FIELDS
from .workflows import FIELDS, DOCS, WORKFLOWS, workflow, current_step, editable_step, actor_for, actor_for_transition, transition_rule, role_names
from . import vacations

ZERO = Decimal('0.00')
TERMINAL = {'cerrado', 'rechazado'}


def audit(case, user, action, before='', after='', note='', **details):
    return Event.objects.create(case=case, actor=user, action=action, before=before, after=after, note=note, details={'result': 'validado', **details})


def amount(data, key):
    try:
        value = Decimal(str(data.get(key, '0')))
        if not value.is_finite() or value < 0:
            raise InvalidOperation
        return value.quantize(Decimal('0.01'))
    except (InvalidOperation, ValueError):
        raise ValidationError(f'Importe no válido: {key}')


def totals(case):
    sums = {row['kind']: row['total'] for row in case.financial_entries.values('kind').annotate(total=Sum('amount'))}
    requested = amount(case.data, 'requested')
    recognized = amount(case.data, 'recognized')
    recovered = sums.get('recuperacion', ZERO)
    paid = sums.get('desembolso', ZERO)
    returned = sums.get('reintegro', ZERO)
    executed = amount(case.data, 'executed')
    authorized = amount(case.data, 'authorized_total')
    return {'requested': requested, 'recognized': recognized, 'recovered': recovered, 'pending': requested - recovered, 'difference': requested - recognized, 'paid': paid, 'returned': returned, 'executed': executed, 'authorized': authorized, 'travel_balance': paid - executed - returned, 'committed': amount(case.data, 'rp_amount') if case.events.filter(action='Etapa completada', before='rp').exists() else ZERO}


def compensatory_balance(user):
    values = {row['kind']: row['total'] for row in user.compensatory_ledger.values('kind').annotate(total=Sum('minutes'))}
    credit = values.get('credito', 0) or 0
    debit = values.get('debito', 0) or 0
    return {'credit': credit, 'debit': debit, 'balance': credit - debit}


def compensatory_summary(case):
    balance = compensatory_balance(case.owner)
    return {
        **balance,
        'worked': int(case.data.get('worked_minutes') or 0),
        'approved': int(case.data.get('approved_minutes') or 0),
        'requested': int(case.data.get('requested_minutes') or 0),
    }


def check_revision(case, revision):
    if case.revision != revision:
        raise ValidationError('El expediente cambió en otra sesión. Recargue antes de continuar.')
    if case.stage in TERMINAL:
        raise ValidationError('El expediente está finalizado y no admite modificaciones.')


def bump(case):
    case.revision += 1
    case.save()


def set_deadline(case):
    step = editable_step(case)
    days = step.get('due_days') if step else None
    case.due_at = timezone.now() + timedelta(days=days) if days else None


def validate_dates(case, strict=False):
    data = case.data
    if case.kind == 'vacaciones':
        vacations.plan_case(case, strict)
        return
    if case.kind == 'compensatorio':
        work_date = data.get('work_date')
        start, end = data.get('work_start'), data.get('work_end')
        if strict and (not work_date or not start or not end):
            raise ValidationError('Debe registrar la fecha y el horario del tiempo trabajado.')
        if work_date:
            try:
                worked_on = date.fromisoformat(work_date)
            except ValueError:
                raise ValidationError('La fecha del tiempo trabajado no es válida.')
            if worked_on > timezone.localdate():
                raise ValidationError('No se puede registrar como trabajado un tiempo futuro.')
        if start and end:
            try:
                start_time, end_time = time.fromisoformat(start), time.fromisoformat(end)
            except ValueError:
                raise ValidationError('El horario del tiempo trabajado no es válido.')
            start_minutes = start_time.hour * 60 + start_time.minute
            end_minutes = end_time.hour * 60 + end_time.minute
            pause = int(data.get('break_minutes') or 0)
            if end_minutes <= start_minutes or pause < 0 or pause >= end_minutes - start_minutes:
                raise ValidationError('La hora final debe ser posterior al inicio y la pausa menor que el intervalo.')
            data['worked_minutes'] = end_minutes - start_minutes - pause
        request_start, request_end = data.get('request_start_date'), data.get('request_end_date')
        if request_start or request_end:
            if not request_start or not request_end:
                return
            try:
                first, last = date.fromisoformat(request_start), date.fromisoformat(request_end)
            except ValueError:
                raise ValidationError('Las fechas solicitadas para el compensatorio no son válidas.')
            if last < first or (last - first).days > 366:
                raise ValidationError('El periodo solicitado no es válido o supera el máximo técnico de 366 días.')
            data['days'] = (last - first).days + 1
        return
    start, end = data.get('start_date'), data.get('end_date')
    if not start or not end:
        if strict:
            raise ValidationError('Debe registrar las fechas de inicio y terminación.')
        return
    try:
        first, last = date.fromisoformat(start), date.fromisoformat(end)
    except ValueError:
        raise ValidationError('Las fechas no son válidas.')
    if last < first:
        raise ValidationError('La fecha de terminación debe ser igual o posterior al inicio.')
    days = (last - first).days + 1
    if days > 3660:
        raise ValidationError('La duración supera el máximo técnico de 3660 días.')
    data['days'] = days
    # Compare JSON dates as ISO strings; the draft is included to prevent double submission.
    others = Case.objects.filter(owner=case.owner, kind=case.kind).exclude(pk=case.pk).exclude(stage='rechazado')
    for other in others.only('data'):
        a, b = other.data.get('start_date'), other.data.get('end_date')
        if a and b and start <= b and a <= end:
            raise ValidationError('Ya existe un expediente del mismo módulo con fechas superpuestas para este solicitante.')


@transaction.atomic
def create_case(user, kind, cleaned):
    if kind not in WORKFLOWS:
        raise ValidationError('Módulo desconocido.')
    if not hasattr(user, 'profile'):
        raise ValidationError('El usuario no tiene dependencia configurada.')
    if kind == 'vacaciones':
        vacations.check_eligible(user)
    policy = PolicyVersion.objects.filter(kind=kind).first()
    if not policy:
        source = {'compensatorio': 'Propuesta técnica pendiente de procedimiento oficial de compensatorios.', 'vacaciones': 'Propuesta basada en el formato de programación anual de vacaciones; procedimiento oficial no aportado.'}.get(kind, 'Propuesta basada en el prompt; resoluciones no aportadas.')
        policy = PolicyVersion.objects.create(kind=kind, version=1, config={}, confirmed=False, source=source)
    case = Case(kind=kind, owner=user, department=user.profile.department, policy=policy)
    case.data = serialize({k: v for k, v in cleaned.items() if k in BASE_FIELDS[kind]})
    validate_dates(case)
    set_deadline(case)
    case.save()
    audit(case, user, 'Borrador creado', after=case.stage, values=case.data, policy_version=policy.version)
    return case


def serialize(values):
    result = {}
    for key, value in values.items():
        if isinstance(value, (date, time, Decimal)):
            value = str(value)
        elif isinstance(value, TravelScale):
            value = value.pk
        if value is not None:
            result[key] = value
    return result


@transaction.atomic
def save_data(user, case_id, revision, cleaned):
    case = Case.objects.select_for_update().select_related('policy').get(pk=case_id)
    check_revision(case, revision)
    if not actor_for(user, case):
        raise PermissionDenied('No tiene autorización para modificar esta etapa.')
    step = editable_step(case)
    keys = BASE_FIELDS[case.kind] if step['key'] == 'borrador' else step['fields']
    values = serialize({k: v for k, v in cleaned.items() if k in keys})
    case.data.update(values)
    validate_dates(case)
    for key in keys:
        if FIELDS[key][1] == 'pastdate' and case.data.get(key) and date.fromisoformat(case.data[key]) > timezone.localdate():
            raise ValidationError(f'{FIELDS[key][0]} no puede estar en el futuro.')
    if case.data.get('resolution_date') and date.fromisoformat(case.data['resolution_date']) > timezone.localdate():
        raise ValidationError('Una resolución firmada no puede tener fecha futura.')
    if step['key'] == 'liquidacion' and all(case.data.get(k) is not None and case.data.get(k) != '' for k in step['fields']):
        liquidate(case, user)
    bump(case)
    audit(case, user, 'Datos guardados', before=case.stage, after=case.stage, values=values)
    return case


def liquidate(case, user):
    data = case.data
    try:
        scale = TravelScale.objects.get(pk=data['scale_id'])
    except (TravelScale.DoesNotExist, ValueError, TypeError):
        raise ValidationError('Seleccione una escala aprobada.')
    start, end = date.fromisoformat(data['start_date']), date.fromisoformat(data['end_date'])
    if scale.valid_from > start or scale.valid_until < end:
        raise ValidationError('La escala no cubre toda la comisión. Registre una versión aplicable a su período completo.')
    if scale.category.casefold().strip() != data['category'].casefold().strip() or scale.destination.casefold().strip() != data['destination'].casefold().strip():
        raise ValidationError('La categoría y el destino de la escala deben coincidir con la solicitud.')
    nights, days = int(data['overnight_days']), int(data['day_days'])
    if nights < 0 or days < 0 or not 1 <= nights + days <= data['days'] or nights > data['days'] - 1:
        raise ValidationError('Revise los días liquidados: no pueden superar la duración; la pernoctación requiere al menos una noche.')
    if nights and not data.get('overnight'):
        raise ValidationError('La solicitud no indicó necesidad de pernoctar.')
    transport = amount(data, 'authorized_transport')
    total = (scale.overnight_rate * nights + scale.day_rate * days + transport).quantize(Decimal('0.01'))
    if total <= 0:
        raise ValidationError('El total autorizado debe ser mayor que cero.')
    if data.get('cdp_amount') and total > amount(data, 'cdp_amount'):
        raise ValidationError('La liquidación supera la disponibilidad del CDP.')
    data['authorized_total'] = str(total)
    data['scale_snapshot'] = {'id': scale.pk, 'name': scale.name, 'category': scale.category, 'destination': scale.destination, 'valid_from': str(scale.valid_from), 'valid_until': str(scale.valid_until), 'overnight_rate': str(scale.overnight_rate), 'day_rate': str(scale.day_rate), 'source': scale.source, 'approval_reference': scale.approval_reference, 'approved_by': scale.approved_by_id, 'liquidated_by': user.pk, 'liquidated_at': timezone.now().isoformat(), 'duration_basis': 'Días calendario inclusivos; días pagables verificados por responsable.'}


def validate_step(case, step):
    missing = [FIELDS[k][0] for k in step['fields'] if case.data.get(k) is None or case.data.get(k) == '']
    if missing:
        raise ValidationError('Complete: ' + ', '.join(missing))
    validate_dates(case, strict=True)
    # Returned steps require newly submitted evidence; all previous versions remain in the history.
    last_return = case.events.filter(action='Devuelto para corrección').order_by('-created_at').first()
    last_financial_reset = case.events.filter(action='Movimiento financiero registrado', after='contabilidad').order_by('-created_at').first()
    thresholds = [e.created_at for e in [last_return, last_financial_reset] if e]
    docs = case.documents.all()
    if thresholds:
        docs = docs.filter(created_at__gte=max(thresholds))
    existing = set(docs.values_list('category', flat=True))
    missing_docs = [DOCS[k] for k in step['docs'] if k not in existing]
    if missing_docs:
        raise ValidationError('Adjunte los documentos obligatorios de esta etapa: ' + ', '.join(missing_docs))
    data, key, money = case.data, step['key'], totals(case)
    if key == 'liquidacion' and not data.get('scale_snapshot'):
        raise ValidationError('Debe guardar una liquidación calculada con una escala aprobada.')
    if case.kind == 'incapacidad':
        if key == 'pago_funcionario':
            if amount(data, 'employee_paid') <= 0:
                raise ValidationError('El valor debe ser mayor que cero.')
            days = int(case.data.get('days') or 0)
            payer = case.data.get('payer_entity')
            if not payer:
                payer = 'contraloria' if days <= 2 else 'eps'
                case.data['payer_entity'] = payer
            if days <= 2 and payer == 'eps':
                raise ValidationError('Para incapacidades de hasta 2 días (enfermedad general), el pago debe ser asumido al 100% por la Contraloría Municipal de Pasto y no por la EPS (Resolución 067/2025 y Art. 2.2.3.4.3 DUR 780/2016).')
            if days > 2 and payer == 'contraloria':
                raise ValidationError('Para incapacidades superiores a 2 días, a partir del tercer día el auxilio económico corresponde a la EPS (Resolución 067/2025 y Art. 2.2.3.4.3 DUR 780/2016).')
    elif case.kind == 'vacaciones':
        if key == 'autorizacion' and date.fromisoformat(data['resolution_date']) > date.fromisoformat(data['start_date']):
            raise ValidationError('La resolución de vacaciones debe ser anterior o igual al inicio del disfrute.')
        if key == 'disfrute':
            expected = date.fromisoformat(data['return_date'])
            actual = date.fromisoformat(data['actual_return_date'])
            if actual < expected:
                raise ValidationError('El reintegro es anterior a la fecha prevista. Registre primero la suspensión de las vacaciones.')
            if actual > timezone.localdate():
                raise ValidationError('No se puede registrar un reintegro futuro.')
    elif case.kind == 'viatico':
        if key == 'pago' and money['paid'] != money['authorized']:
            raise ValidationError('El desembolso registrado debe completar el total autorizado.')
        if key == 'comision' and date.fromisoformat(data['end_date']) > timezone.localdate():
            raise ValidationError('La comisión todavía no ha terminado.')
    else:
        rules = case.policy.config.get('compensatory_rules', {})
        if key in {'autorizacion_tiempo', 'solicitud_compensatorio', 'validacion_saldo', 'autorizacion_compensatorio', 'programacion', 'cierre'}:
            if not case.policy.confirmed or rules.get('enabled') is not True:
                raise ValidationError('El reconocimiento y descuento de tiempo está bloqueado hasta que exista una versión institucional confirmada con reglas habilitadas.')
        approved = int(data.get('approved_minutes') or 0)
        worked = int(data.get('worked_minutes') or 0)
        requested_minutes = int(data.get('requested_minutes') or 0)
        if key == 'autorizacion_tiempo':
            if not 0 < approved <= worked:
                raise ValidationError('El tiempo reconocido debe ser positivo y no puede superar el tiempo trabajado calculado.')
            if not rules['min_credit_minutes'] <= approved <= rules['max_credit_minutes']:
                raise ValidationError('El tiempo reconocido no cumple los límites institucionales configurados.')
        if key in {'solicitud_compensatorio', 'validacion_saldo', 'autorizacion_compensatorio'}:
            if not rules['min_request_minutes'] <= requested_minutes <= rules['max_request_minutes']:
                raise ValidationError('La solicitud no cumple los límites institucionales configurados.')
            if requested_minutes > compensatory_balance(case.owner)['balance']:
                raise ValidationError('El tiempo solicitado supera el saldo autorizado disponible.')
        if key == 'autorizacion_compensatorio':
            start, end = data['request_start_date'], data['request_end_date']
            overlapping = CompensatoryLedgerEntry.objects.filter(
                employee=case.owner,
                kind='debito',
                case__data__request_start_date__lte=end,
                case__data__request_end_date__gte=start,
            ).exclude(case=case)
            if overlapping.exists():
                raise ValidationError('El periodo solicitado se superpone con otro compensatorio autorizado.')
    stages = workflow(case)
    is_last_step = (key == 'cierre') or (next((i for i, x in enumerate(stages) if x['key'] == key), -1) == len(stages) - 1)
    if is_last_step and not case.policy.confirmed:
        raise ValidationError('Este expediente usa un flujo provisional. El cierre institucional requiere una versión normativa aprobada antes de abrir el expediente.')


@transaction.atomic
def transition(user, case_id, revision, action, note=''):
    case = Case.objects.select_for_update().select_related('policy').get(pk=case_id)
    check_revision(case, revision)
    if action == 'note':
        if not note.strip():
            raise ValidationError('Escriba la actuación o el seguimiento realizado.')
        # Visibility has already been checked by the caller; recheck for direct service use.
        from .access import visible_cases
        if not visible_cases(user).filter(pk=case.pk).exists():
            raise PermissionDenied
        audit(case, user, 'Seguimiento registrado', before=case.stage, after=case.stage, note=note)
        bump(case)
        return case
    if action == 'advance' and not actor_for_transition(user, case, action):
        raise PermissionDenied('No tiene el rol autorizado para esta transición.')
    if action != 'advance' and not actor_for(user, case):
        raise PermissionDenied('No tiene el rol responsable de esta etapa.')
    before = case.stage
    step = editable_step(case)
    steps = workflow(case)
    index = next(i for i, x in enumerate(steps) if x['key'] == step['key'])
    if action == 'advance':
        validate_step(case, step)
        if case.stage == 'correccion':
            case.stage = case.return_to
            case.return_to = ''
            case.correction_fields = ''
        else:
            case.stage = transition_rule(case, action)['to']
        if case.kind == 'compensatorio' and step['key'] == 'autorizacion_tiempo':
            entry = CompensatoryLedgerEntry.objects.create(
                employee=case.owner,
                case=case,
                kind='credito',
                minutes=int(case.data['approved_minutes']),
                effective_on=date.fromisoformat(case.data['work_date']),
                rule_reference=case.data['recognition_rule_reference'],
                actor=user,
            )
            audit(case, user, 'Tiempo reconocido y acreditado', before=before, after=case.stage, ledger_entry=entry.pk, minutes=entry.minutes, rule_reference=entry.rule_reference)
        if case.kind == 'compensatorio' and step['key'] == 'autorizacion_compensatorio':
            entry = CompensatoryLedgerEntry.objects.create(
                employee=case.owner,
                case=case,
                kind='debito',
                minutes=int(case.data['requested_minutes']),
                effective_on=date.fromisoformat(case.data['request_start_date']),
                rule_reference=case.policy.approval_reference,
                actor=user,
            )
            audit(case, user, 'Compensatorio autorizado y descontado', before=before, after=case.stage, ledger_entry=entry.pk, minutes=entry.minutes, rule_reference=entry.rule_reference)
        if case.kind == 'vacaciones' and step['key'] == 'autorizacion':
            entry = grant_vacation(user, case)
            audit(case, user, 'Vacaciones concedidas y descontadas', before=before, after=case.stage, ledger_entry=entry.pk, days=entry.days, period=entry.period.label)
        action_label = 'Etapa completada'
    elif action == 'return':
        if case.stage == 'correccion' or index == 0 or 'owner' in step['roles']:
            raise ValidationError('Esta etapa no admite devolución.')
        if not note.strip():
            raise ValidationError('Indique los documentos y campos que deben corregirse.')
        # Financial and budget records are immutable; do not rewind past actual payments.
        if case.financial_entries.exists() or (case.kind == 'incapacidad' and (case.data.get('employee_payment_ref') or index > next(i for i, x in enumerate(steps) if x['key'] == 'pago_funcionario'))):
            if step['key'] != 'revision_legalizacion':
                raise ValidationError('Hay actuaciones financieras previas. Registre una observación y complete la etapa; los pagos no pueden deshacerse por devolución.')
        if case.kind == 'vacaciones' and case.vacation_entries.exists():
            raise ValidationError('Las vacaciones ya fueron concedidas. Use la suspensión o el aplazamiento en lugar de una devolución.')
        case.return_to = case.stage
        case.stage = 'correccion'
        case.correction_fields = note
        action_label = 'Devuelto para corrección'
    elif action == 'reject':
        if case.stage not in {'revision', 'revision_soportes'} or not note.strip():
            raise ValidationError('El rechazo exige justificación y solo procede en la revisión inicial.')
        case.stage = 'rechazado'
        action_label = 'Solicitud rechazada'
    else:
        raise ValidationError('Acción desconocida.')
    set_deadline(case)
    bump(case)
    audit(case, user, action_label, before=before, after=case.stage, note=note, documents=list(case.documents.filter(category__in=step['docs']).values_list('id', flat=True)), values={k: case.data.get(k) for k in step['fields']}, policy_version=case.policy.version, totals={k: str(v) for k, v in totals(case).items()})
    return case


def treasury_allowed(user, case):
    if 'tesoreria' not in role_names(user) or case.stage in TERMINAL or case.stage == 'correccion':
        return False
    return case.stage in ({'pago_funcionario'} if case.kind == 'incapacidad' else {'pago'})


def upload_categories(user, case):
    categories = []
    if actor_for(user, case):
        step = editable_step(case)
        categories += step['docs']
        if step['key'] == 'borrador':
            categories += (['soporte_solicitud', 'epicrisis'] if case.kind == 'incapacidad' else ['soporte_solicitud'])
        if step['key'] == 'transcripcion':
            categories += ['transcripcion', 'solicitud_recobro']
        if step['key'] == 'comprobante':
            categories += ['comprobante', 'transcripcion', 'solicitud_recobro', 'reconocimiento']
        if step['key'] == 'comision':
            categories += ['informe_comision', 'comprobante_informe', 'gastos']
        if case.kind == 'vacaciones' and step['key'] == 'disfrute':
            categories += ['novedad_vacaciones']
    if treasury_allowed(user, case):
        categories += ['pago_funcionario', 'recuperacion'] if case.kind == 'incapacidad' else ['desembolso', 'reintegro']
    return sorted(set(categories))


@transaction.atomic
def upload(user, case_id, revision, category, file):
    case = Case.objects.select_for_update().select_related('policy').get(pk=case_id)
    check_revision(case, revision)
    if category not in upload_categories(user, case):
        raise PermissionDenied('No puede cargar este tipo documental en la etapa actual.')
    if not 0 < file.size <= 8 * 1024 * 1024:
        raise ValidationError('El archivo debe tener entre 1 byte y 8 MB.')
    content = file.read(8 * 1024 * 1024 + 1)
    if len(content) > 8 * 1024 * 1024:
        raise ValidationError('El archivo supera los 8 MB.')
    formats = [('.pdf', b'%PDF-', 'application/pdf'), ('.png', b'\x89PNG\r\n\x1a\n', 'image/png'), ('.jpg', b'\xff\xd8\xff', 'image/jpeg')]
    match = next((x for x in formats if content.startswith(x[1])), None)
    if not match:
        raise ValidationError('Solo se permiten archivos PDF, PNG o JPG con firma válida.')
    ext = os.path.splitext(file.name)[1].lower()
    if ext not in ({'.jpg', '.jpeg'} if match[0] == '.jpg' else {match[0]}):
        raise ValidationError('La extensión no corresponde al contenido del archivo.')
    name = get_valid_filename(os.path.basename(file.name))[:190]
    digest = hashlib.sha256(content).hexdigest()
    if case.documents.filter(category=category, sha256=digest).exists():
        raise ValidationError('Ese documento ya está registrado en esta categoría. Para corregirlo, adjunte una versión actualizada.')
    document = Document.objects.create(case=case, category=category, name=name, content=content, content_type=match[2], size=len(content), sha256=digest, uploaded_by=user)
    bump(case)
    audit(case, user, 'Documento incorporado', before=case.stage, after=case.stage, document_id=document.pk, category=category, sha256=digest)
    return document


@transaction.atomic
def record_payment(user, case_id, revision, cleaned):
    case = Case.objects.select_for_update().select_related('policy').get(pk=case_id)
    check_revision(case, revision)
    if not treasury_allowed(user, case):
        raise PermissionDenied('El registro financiero requiere Tesorería y una etapa habilitada.')
    kind, value = cleaned['kind'], cleaned['amount']
    evidence = cleaned['evidence']
    if evidence.case_id != case.pk or evidence.category != kind:
        raise ValidationError('El soporte debe corresponder al expediente y tipo de movimiento.')
    if cleaned['paid_on'] > timezone.localdate():
        raise ValidationError('No se puede registrar un pago futuro como realizado.')
    if value <= 0:
        raise ValidationError('El importe debe ser positivo.')
    if FinancialEntry.objects.filter(case=case, kind=kind, reference=cleaned['reference']).exists():
        raise ValidationError('La referencia financiera ya fue registrada.')
    money, before = totals(case), case.stage
    if case.kind == 'incapacidad':
        if kind != 'recuperacion' or money['recovered'] + value > money['requested']:
            raise ValidationError('La recuperación no puede superar lo solicitado.')
        # Additional recognition must be documented before recovery can exceed the acknowledged value.
        if money['recovered'] + value > money['recognized']:
            raise ValidationError('El ingreso supera lo reconocido. Registre primero un reconocimiento adicional con su evidencia.')
    else:
        if kind == 'desembolso':
            if case.stage != 'pago' or money['paid'] + value > money['authorized']:
                raise ValidationError('El desembolso debe registrarse en Pago y no puede superar lo autorizado.')
        elif kind == 'reintegro':
            if case.stage == 'pago' or money['returned'] + value > money['paid'] - money['executed']:
                raise ValidationError('El reintegro no puede superar la diferencia entre desembolso y gastos ejecutados.')
        else:
            raise ValidationError('Tipo de movimiento no permitido.')
    entry = FinancialEntry.objects.create(case=case, kind=kind, amount=value, paid_on=cleaned['paid_on'], reference=cleaned['reference'], evidence=evidence, actor=user)
    # New receipts after accounting invalidate downstream accounting checks, preserving their history.
    if case.kind == 'incapacidad' and case.stage in {'conciliacion', 'saldos'}:
        case.stage = 'contabilidad'
        set_deadline(case)
    bump(case)
    audit(case, user, 'Movimiento financiero registrado', before=before, after=case.stage, entry_id=entry.pk, kind=kind, amount=str(value), reference=entry.reference, document_id=evidence.pk)
    return entry


@transaction.atomic
def additional_recognition(user, case_id, revision, recognized, note, document_id):
    case = Case.objects.select_for_update().select_related('policy').get(pk=case_id)
    check_revision(case, revision)
    if 'talento' not in role_names(user) or case.kind != 'incapacidad' or case.stage not in {'transcripcion', 'comprobante'}:
        raise PermissionDenied
    value = Decimal(recognized)
    if not value.is_finite() or value <= totals(case)['recognized'] or value > totals(case)['requested'] or value.as_tuple().exponent < -2 or not note.strip():
        raise ValidationError('El reconocimiento acumulado debe aumentar sin superar lo solicitado y requiere observación.')
    document = case.documents.filter(pk=document_id, category='reconocimiento').first()
    if not document:
        raise ValidationError('Adjunte un reconocimiento actualizado.')
    from django.db.models import Q
    latest = case.events.filter(Q(action='Reconocimiento actualizado') | Q(action='Etapa completada', before='seguimiento')).order_by('-created_at').first()
    if latest and document.created_at <= latest.created_at:
        raise ValidationError('Adjunte un nuevo soporte para este reconocimiento.')
    before = case.stage
    case.data['recognized'] = str(value)
    bump(case)
    audit(case, user, 'Reconocimiento actualizado', before=before, after=case.stage, note=note, recognized=str(value), document_id=document.pk)
    return case


# --- Vacaciones -----------------------------------------------------------------------------------

def grant_vacation(user, case):
    """Descuenta los días concedidos del periodo asignado. Se ejecuta dentro de la transición."""
    period = VacationPeriod.objects.get(pk=case.data['period_id'], employee=case.owner)
    days = int(case.data['business_days'])
    if vacations.period_balance(period) < days:
        raise ValidationError(f'El {period.label} ya no tiene saldo suficiente para conceder {days} días hábiles.')
    return VacationLedgerEntry.objects.create(period=period, case=case, kind='disfrute', days=days, effective_on=date.fromisoformat(case.data['start_date']), note=case.data.get('resolution_number', ''), actor=user)


def can_interrupt_vacation(user, case):
    return case.kind == 'vacaciones' and case.stage == 'disfrute' and 'talento' in role_names(user) and not case.vacation_entries.filter(kind='devolucion').exists()


@transaction.atomic
def interrupt_vacation(user, case_id, revision, kind, on_date, reason, document_id):
    """Suspensión (durante el disfrute) o aplazamiento (antes de iniciar). Devuelve los días no disfrutados."""
    case = Case.objects.select_for_update().select_related('policy', 'owner').get(pk=case_id)
    check_revision(case, revision)
    if not can_interrupt_vacation(user, case):
        raise PermissionDenied('Solo Talento Humano registra novedades de vacaciones concedidas, una vez por expediente.')
    if not reason.strip():
        raise ValidationError('Indique el motivo de la novedad y el acto que la soporta.')
    data = case.data
    start, end = date.fromisoformat(data['start_date']), date.fromisoformat(data['end_date'])
    granted = int(data['business_days'])
    if kind == 'aplazamiento':
        if on_date != start:
            raise ValidationError('El aplazamiento aplica desde la fecha de inicio prevista.')
        if timezone.localdate() >= start:
            raise ValidationError('Las vacaciones ya iniciaron; registre una suspensión.')
        enjoyed = 0
    elif kind == 'suspension':
        if not start < on_date <= end:
            raise ValidationError('La suspensión debe ocurrir después del primer día y antes del último día de disfrute.')
        if on_date > timezone.localdate():
            raise ValidationError('No se puede registrar una suspensión futura.')
        enjoyed = vacations.count_business_days(start, on_date - timedelta(days=1))
    else:
        raise ValidationError('Novedad desconocida.')
    returned = granted - enjoyed
    if returned <= 0:
        raise ValidationError('No quedan días por devolver.')
    entry = case.vacation_entries.filter(kind='disfrute').select_related('period').first()
    document = case.documents.filter(pk=document_id, category='novedad_vacaciones', created_at__gte=entry.created_at).first()
    if not document:
        raise ValidationError('Adjunte el soporte de la novedad después de la concesión.')
    refund = VacationLedgerEntry.objects.create(period=entry.period, case=case, kind='devolucion', days=returned, effective_on=on_date, note=reason, actor=user)
    data.update({'interruption_kind': kind, 'interruption_date': on_date.isoformat(), 'interruption_reason': reason, 'enjoyed_days': enjoyed, 'returned_days': returned, 'return_date': on_date.isoformat()})
    if enjoyed:
        data['end_date'] = (on_date - timedelta(days=1)).isoformat()
    before = case.stage
    bump(case)
    audit(case, user, 'Vacaciones suspendidas' if kind == 'suspension' else 'Vacaciones aplazadas', before=before, after=case.stage, note=reason, ledger_entry=refund.pk, enjoyed=enjoyed, returned=returned, document_id=document.pk)
    return case


@transaction.atomic
def register_initial_vacation_days(user, employee, period_number, days, note):
    """Carga inicial: días ya disfrutados de un periodo antes de usar el sistema."""
    if 'talento' not in role_names(user):
        raise PermissionDenied('Solo Talento Humano registra saldos iniciales.')
    if not note.strip():
        raise ValidationError('Indique la fuente del saldo inicial (resolución, nómina u hoja de vida).')
    periods = {p.number: p for p in vacations.sync_periods(employee)}
    period = periods.get(period_number)
    if not period:
        raise ValidationError('El periodo indicado aún no está causado.')
    if not 0 < days <= vacations.period_balance(period):
        raise ValidationError('Los días deben ser positivos y no superar el saldo del periodo.')
    entry = VacationLedgerEntry.objects.create(period=period, kind='carga_inicial', days=days, effective_on=period.service_to, note=note, actor=user)
    audit(None, user, 'Saldo inicial de vacaciones registrado', employee=employee.pk, period=period.number, days=days, ledger_entry=entry.pk)
    return entry


def apply_profile(profile, data):
    """Actualiza los datos laborales del perfil y su dependencia (se crea si no existe)."""
    name = (data.get('department') or '').strip()
    if not name:
        raise ValidationError('Indique la dependencia del funcionario.')
    dependencia = Dependencia.objects.filter(name__iexact=name).first() or Dependencia.objects.create(name=name)
    profile.department = dependencia.name
    profile.dependencia = dependencia
    for key in ['employment', 'cargo', 'codigo', 'grado']:
        if key in data:
            setattr(profile, key, data[key] or '')
    if 'hire_date' in data:
        profile.hire_date = data['hire_date']
    if 'cedula' in data:
        profile.cedula = data['cedula'] or None
    profile.save()
    if data.get('is_jefe'):
        dependencia.jefe = profile.user
        dependencia.save(update_fields=['jefe'])
    elif 'is_jefe' in data and dependencia.jefe_id == profile.user_id:
        dependencia.jefe = None
        dependencia.save(update_fields=['jefe'])
    return profile
