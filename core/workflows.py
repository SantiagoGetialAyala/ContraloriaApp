"""Proposed administrative workflow; official sources still require institutional review."""
from copy import deepcopy
from .models import ROLES

# key, label, type, choices. Requiredness belongs to the current stage.
FIELDS = {
    'start_date': ('Fecha de inicio / salida', 'date'),
    'end_date': ('Fecha de terminación / regreso', 'date'),
    'leave_type': ('Tipo de incapacidad o licencia', 'choice', [('comun', 'Enfermedad general'), ('accidente', 'Accidente de trabajo'), ('laboral', 'Enfermedad laboral'), ('maternidad', 'Maternidad'), ('paternidad', 'Paternidad')]),
    'incapacity_number': ('Número de incapacidad médica (EPS)', 'text'),
    'radication_number': ('Número de radicación de la incapacidad', 'text'),
    'epicrisis_radication': ('Número de radicado de epicrisis / historia clínica', 'text'),
    'entity': ('EPS, ARL o entidad responsable', 'text'),
    'observations': ('Observaciones (evite incluir diagnósticos)', 'textarea'),
    'purpose': ('Objeto y motivo de la comisión', 'textarea'),
    'destination': ('Destino de la comisión', 'text'),
    'category': ('Categoría para la escala', 'text'),
    'overnight': ('¿Necesita pernoctar?', 'bool'),
    'transport': ('Gastos de transporte solicitados (COP)', 'money'),
    'draft_text': ('Texto del proyecto de resolución (borrador para revisión)', 'textarea'),
    'cdp_request_ref': ('Referencia de solicitud del CDP', 'text'),
    'cdp_request_date': ('Fecha de solicitud del CDP', 'pastdate'),
    'rp_request_ref': ('Referencia de solicitud del RP', 'text'),
    'rp_request_date': ('Fecha de solicitud del RP', 'pastdate'),
    'review_note': ('Resultado de la verificación documental', 'textarea'),
    'legal_note': ('Concepto de revisión jurídica', 'textarea'),
    'resolution_number': ('Número de resolución firmada', 'text'),
    'resolution_radication': ('Número de radicado de la resolución', 'text'),
    'resolution_date': ('Fecha de resolución', 'date'),
    'archive_reference': ('Referencia de incorporación al expediente', 'text'),
    'payer_entity': ('Entidad responsable del pago', 'choice', [('contraloria', 'Contraloría Municipal de Pasto (hasta 2 días - 100% Entidad)'), ('eps', 'Entidad Promotora de Salud - EPS (a partir del día 3 - subsidio EPS)')]),
    'employee_paid': ('Valor pagado al funcionario (COP)', 'money'),
    'employee_paid_on': ('Fecha de pago al funcionario', 'pastdate'),
    'employee_payment_ref': ('Referencia de pago al funcionario', 'text'),
    'filing_entity': ('Entidad de transcripción', 'text'),
    'filing_number': ('Número de radicado manual', 'text'),
    'filing_date': ('Fecha de radicación', 'pastdate'),
    'filing_result': ('Resultado de la transcripción', 'textarea'),
    'requested': ('Valor solicitado en recobro (COP)', 'money'),
    'recovery_reference': ('Referencia de solicitud de recobro', 'text'),
    'recovery_date': ('Fecha de solicitud de recobro', 'pastdate'),
    'recognized': ('Valor reconocido por la entidad (COP)', 'money'),
    'recognition_date': ('Fecha del reconocimiento', 'pastdate'),
    'followup_note': ('Seguimiento, comunicaciones y resultado', 'textarea'),
    'finance_notice': ('Referencia de comunicación al área financiera', 'text'),
    'accounting_reference': ('Comprobante de registro contable', 'text'),
    'reconciliation_note': ('Resultado de conciliación y diferencias', 'textarea'),
    'balance_note': ('Gestión de saldos y requerimientos', 'textarea'),
    'control_note': ('Resultado de revisión de Control Interno', 'textarea'),
    'closure_note': ('Constancia de cierre administrativo, financiero y documental', 'textarea'),
    'initial_authorization': ('Referencia de autorización de la comisión', 'text'),
    'cdp_number': ('Número del CDP efectivamente registrado', 'text'),
    'cdp_date': ('Fecha del CDP', 'pastdate'),
    'cdp_amount': ('Disponibilidad presupuestal (COP)', 'money'),
    'scale_id': ('Escala aprobada aplicable', 'scale'),
    'overnight_days': ('Días liquidados con pernoctación', 'int'),
    'day_days': ('Días liquidados sin pernoctación', 'int'),
    'authorized_transport': ('Transporte autorizado (COP)', 'money'),
    'rp_number': ('Número del RP efectivamente registrado', 'text'),
    'rp_date': ('Fecha del RP', 'pastdate'),
    'rp_amount': ('Recursos comprometidos (COP)', 'money'),
    'payment_order': ('Número de orden de pago', 'text'),
    'commission_report': ('Informe de ejecución de la comisión', 'textarea'),
    'executed': ('Gastos ejecutados y soportados (COP)', 'money'),
    'legalization_note': ('Observaciones de legalización', 'textarea'),
    'legalization_review': ('Resultado de revisión de legalización', 'textarea'),
    'work_date': ('Fecha del tiempo trabajado', 'pastdate'),
    'work_start': ('Hora de inicio', 'time'),
    'work_end': ('Hora de terminación', 'time'),
    'break_minutes': ('Minutos de pausa no computables', 'int'),
    'worked_minutes': ('Tiempo trabajado calculado (minutos)', 'int'),
    'activity_description': ('Actividad extraordinaria realizada', 'textarea'),
    'support_review_note': ('Resultado de la revisión de soportes', 'textarea'),
    'approved_minutes': ('Tiempo expresamente reconocido (minutos)', 'int'),
    'recognition_rule_reference': ('Regla institucional aplicada', 'text'),
    'request_start_date': ('Inicio solicitado del compensatorio', 'date'),
    'request_end_date': ('Terminación solicitada del compensatorio', 'date'),
    'requested_minutes': ('Tiempo solicitado para compensar (minutos)', 'int'),
    'request_reason': ('Justificación de la solicitud', 'textarea'),
    'balance_review_note': ('Verificación de saldo y condiciones', 'textarea'),
    'compensatory_authorization_note': ('Decisión de autorización', 'textarea'),
    'schedule_note': ('Registro de programación y novedades', 'textarea'),
    'business_days': ('Días hábiles a disfrutar', 'int'),
    'return_date': ('Fecha prevista de reintegro', 'date'),
    'period_label': ('Periodo de causación asignado', 'text'),
    'jefe_note': ('Visto bueno del jefe inmediato', 'textarea'),
    'actual_return_date': ('Fecha efectiva de reintegro', 'pastdate'),
    'interruption_kind': ('Novedad registrada', 'choice', [('suspension', 'Suspensión'), ('aplazamiento', 'Aplazamiento')]),
    'interruption_date': ('Fecha de la novedad', 'date'),
    'interruption_reason': ('Motivo de la novedad', 'textarea'),
    'enjoyed_days': ('Días hábiles disfrutados', 'int'),
    'returned_days': ('Días hábiles devueltos al periodo', 'int'),
}
DOCS = {
    'certificado': 'Certificado médico / Incapacidad', 'epicrisis': 'Epicrisis o historia clínica', 'soporte_solicitud': 'Soportes de la solicitud',
    'proyecto': 'Proyecto de resolución', 'concepto_juridico': 'Concepto jurídico',
    'acto_firmado': 'Resolución firmada', 'archivo': 'Constancia de incorporación al expediente',
    'pago_funcionario': 'Soporte de pago al funcionario', 'transcripcion': 'Evidencia de transcripción y radicación',
    'comprobante': 'Comprobante de radicación / recobro', 'comprobante_informe': 'Comprobante de informe',
    'solicitud_recobro': 'Solicitud de recobro radicada', 'reconocimiento': 'Reconocimiento o decisión de la entidad',
    'recuperacion': 'Soporte de recuperación', 'comunicacion_financiera': 'Comunicación al área financiera',
    'registro_contable': 'Comprobante contable', 'conciliacion': 'Soporte de conciliación',
    'gestion_saldos': 'Comunicaciones y gestión de saldos', 'control_interno': 'Revisión de Control Interno',
    'cierre': 'Constancia de cierre', 'autorizacion_comision': 'Autorización de comisión',
    'solicitud_cdp': 'Solicitud de CDP', 'solicitud_rp': 'Solicitud de RP', 'cdp': 'CDP oficial registrado', 'rp': 'RP oficial registrado', 'liquidacion': 'Soporte de liquidación',
    'orden_pago': 'Orden de pago', 'desembolso': 'Soporte de desembolso',
    'informe_comision': 'Informe y evidencias de comisión', 'gastos': 'Soportes de gastos ejecutados',
    'revision_legalizacion': 'Revisión de legalización', 'reintegro': 'Soporte de reintegro',
    'soporte_tiempo': 'Soporte del tiempo trabajado', 'revision_soporte_tiempo': 'Revisión de soportes del tiempo trabajado',
    'autorizacion_reconocimiento': 'Autorización del reconocimiento de tiempo', 'solicitud_compensatorio': 'Solicitud de compensatorio',
    'revision_saldo': 'Verificación de saldo y condiciones', 'autorizacion_compensatorio': 'Autorización del compensatorio',
    'novedad_vacaciones': 'Soporte de suspensión o aplazamiento de vacaciones',
}
# Roles relacionales: dependen del expediente, no de un grupo del usuario.
RELATIONAL_ROLES = {'owner': 'Solicitante', 'jefe': 'Jefe inmediato'}

def s(key, label, roles, fields=(), docs=()):
    return {'key': key, 'label': label, 'roles': list(roles), 'fields': list(fields), 'docs': list(docs)}

ACT = [
    s('proyecto', 'Proyecto de resolución', ['talento'], ['draft_text'], ['proyecto']),
    s('juridica', 'Revisión jurídica', ['juridica'], ['legal_note'], ['concepto_juridico']),
    s('autorizacion', 'Aprobación y acto firmado', ['autoridad'], ['resolution_number', 'resolution_radication', 'resolution_date'], ['acto_firmado']),
]
INC = [
    s('borrador', 'Registro de incapacidad', ['owner'], ['start_date', 'end_date', 'leave_type', 'entity'], ['certificado']),
    s('revision', 'Verificación de requisitos', ['talento'], ['review_note']),
    s('autorizacion', 'Resolución administrativa', ['autoridad'], ['resolution_number', 'resolution_radication', 'resolution_date'], ['acto_firmado']),
    s('pago_funcionario', 'Pago al funcionario', ['tesoreria'], ['payer_entity', 'employee_paid', 'employee_paid_on', 'employee_payment_ref'], ['pago_funcionario']),
    s('transcripcion', 'Transcripción y radicación ante EPS', ['talento'], ['filing_entity', 'filing_number', 'filing_date', 'filing_result'], []),
    s('comprobante', 'Subir comprobante', ['talento', 'owner'], [], []),
]
VIA = [
    s('borrador', 'Solicitud de comisión', ['owner'], ['start_date', 'end_date', 'purpose', 'destination', 'category', 'transport'], ['soporte_solicitud']),
    s('liquidacion', 'Autorización y liquidación', ['talento'], ['scale_id', 'overnight_days', 'day_days', 'authorized_transport'], ['liquidacion']),
    s('autorizacion', 'Resolución de comisión', ['autoridad'], ['resolution_number', 'resolution_radication', 'resolution_date'], ['acto_firmado']),
    s('pago', 'Desembolso de viáticos', ['tesoreria']),
    s('comision', 'Comprobante de informe', ['owner'], ['commission_report'], []),
]
COMP = [
    s('borrador', 'Registro de tiempo trabajado', ['owner'], ['work_date', 'work_start', 'work_end', 'break_minutes', 'activity_description'], ['soporte_tiempo']),
    s('revision_soportes', 'Revisión de soportes', ['talento'], ['support_review_note'], ['revision_soporte_tiempo']),
    s('autorizacion_tiempo', 'Autorización de reconocimiento', ['autoridad'], ['approved_minutes', 'recognition_rule_reference'], ['autorizacion_reconocimiento']),
    s('solicitud_compensatorio', 'Solicitud de compensatorio', ['owner'], ['request_start_date', 'request_end_date', 'requested_minutes', 'request_reason'], ['solicitud_compensatorio']),
    s('validacion_saldo', 'Validación de saldo y condiciones', ['talento'], ['balance_review_note'], ['revision_saldo']),
    s('autorizacion_compensatorio', 'Autorización del compensatorio', ['autoridad'], ['compensatory_authorization_note'], ['autorizacion_compensatorio']),
    s('programacion', 'Programación y calendario', ['talento'], ['schedule_note']),
    s('cierre', 'Cierre y archivo del expediente', ['talento'], ['closure_note'], ['cierre']),
]
VAC = [
    s('borrador', 'Solicitud de vacaciones', ['owner'], ['start_date', 'business_days']),
    s('visto_bueno', 'Visto bueno del jefe inmediato', ['jefe'], ['jefe_note']),
    s('revision', 'Verificación de saldo y cruces', ['talento'], ['review_note']),
    s('autorizacion', 'Resolución de vacaciones', ['autoridad'], ['resolution_number', 'resolution_date'], ['acto_firmado']),
    s('disfrute', 'Disfrute y reintegro', ['talento'], ['actual_return_date']),
]
WORKFLOWS = {'incapacidad': INC, 'viatico': VIA, 'compensatorio': COMP, 'vacaciones': VAC}


def workflow(case):
    stages = deepcopy(WORKFLOWS[case.kind])
    config = case.policy.config
    for stage in stages:
        key = stage['key']
        stage['roles'] = config.get('roles', {}).get(key, stage['roles'])
        stage['docs'] += config.get('additional_documents', {}).get(key, [])
        stage['due_days'] = config.get('deadlines', {}).get(key)
    return stages


def current_step(case):
    key = case.return_to if case.stage == 'correccion' else case.stage
    return next((x for x in workflow(case) if x['key'] == key), None)


def correction_step(case):
    stages = workflow(case)
    idx = next(i for i, x in enumerate(stages) if x['key'] == case.return_to)
    return stages[max(idx - 1, 0)]


def editable_step(case):
    return correction_step(case) if case.stage == 'correccion' else current_step(case)


def role_names(user):
    return set(user.groups.values_list('name', flat=True)) if user.is_authenticated else set()


def has_stage_role(user, case, roles):
    roles = set(roles)
    if 'owner' in roles and user.pk == case.owner_id:
        return True
    if 'jefe' in roles:
        from .vacations import is_superior
        if is_superior(user, case.owner):
            return True
    return bool(role_names(user) & (roles - set(RELATIONAL_ROLES)))


def actor_for(user, case, step=None):
    step = step or editable_step(case)
    if not step:
        return False
    return has_stage_role(user, case, step['roles'])


def transition_rule(case, action='advance'):
    """Return the configured state transition, falling back to the reviewed default path."""
    step = editable_step(case)
    if not step:
        return None
    configured = case.policy.config.get('transitions', [])
    rule = next((item for item in configured if item['from'] == step['key'] and item['action'] == action), None)
    if rule:
        return rule
    stages = workflow(case)
    index = next(i for i, item in enumerate(stages) if item['key'] == step['key'])
    return {
        'from': step['key'],
        'action': action,
        'to': stages[index + 1]['key'] if index + 1 < len(stages) else 'cerrado',
        'roles': step['roles'],
    }


def actor_for_transition(user, case, action='advance'):
    rule = transition_rule(case, action)
    if not rule:
        return False
    return has_stage_role(user, case, rule['roles'])


def stage_label(case):
    if case.stage == 'cerrado':
        return 'Cerrado'
    if case.stage == 'rechazado':
        return 'Rechazado'
    if case.stage == 'correccion':
        return 'Corrección · ' + correction_step(case)['label']
    step = current_step(case)
    return step['label'] if step else case.stage


def valid_stage_roles(value, default, valid_roles):
    relational = [r for r in default if r in RELATIONAL_ROLES]
    if not isinstance(value, list) or not value:
        return False
    if relational:
        # Una etapa del solicitante o del jefe no puede reasignarse a otro rol.
        return value == relational
    return all(r in valid_roles for r in value)


def validate_config(kind, config):
    from django.core.exceptions import ValidationError
    allowed_keys = {'roles', 'deadlines', 'additional_documents', 'milestones', 'transitions', 'compensatory_rules'}
    if not isinstance(config, dict) or set(config) - allowed_keys:
        raise ValidationError('La configuración contiene claves no admitidas.')
    stages = {s['key']: s for s in WORKFLOWS[kind]}
    valid_roles = {r[0] for r in ROLES} - {'administrador', 'solicitante'}
    for key in ['roles', 'deadlines', 'additional_documents']:
        if not isinstance(config.get(key, {}), dict):
            raise ValidationError(f'{key} debe ser un objeto.')
        for stage, value in config.get(key, {}).items():
            if stage not in stages:
                raise ValidationError(f'Etapa desconocida: {stage}')
            if key == 'roles':
                if not valid_stage_roles(value, stages[stage]['roles'], valid_roles):
                    raise ValidationError('Los roles deben ser institucionales; las etapas del solicitante o del jefe inmediato deben conservar owner o jefe.')
            elif key == 'deadlines' and (type(value) is not int or not 1 <= value <= 3650):
                raise ValidationError('Los plazos deben ser días calendario entre 1 y 3650.')
            elif key == 'additional_documents' and (not isinstance(value, list) or any(d not in DOCS for d in value)):
                raise ValidationError('Documento adicional desconocido.')
    milestones = config.get('milestones', [])
    if not isinstance(milestones, list):
        raise ValidationError('milestones debe ser una lista.')
    for m in milestones:
        if not isinstance(m, dict) or set(m) != {'day', 'label', 'role'} or type(m['day']) is not int or not 1 <= m['day'] <= 3650 or not isinstance(m['label'], str) or not m['label'].strip() or m['role'] not in valid_roles:
            raise ValidationError('Cada hito requiere day (1 a 3650), label y role institucional.')
    transitions = config.get('transitions', [])
    if not isinstance(transitions, list):
        raise ValidationError('transitions debe ser una lista.')
    stage_keys = list(stages)
    seen = set()
    for item in transitions:
        if not isinstance(item, dict) or set(item) != {'from', 'action', 'to', 'roles'}:
            raise ValidationError('Cada transición requiere from, action, to y roles.')
        identity = (item['from'], item['action'])
        if identity in seen or item['from'] not in stages or item['action'] != 'advance':
            raise ValidationError('La transición es duplicada o no corresponde a una etapa conocida.')
        source_index = stage_keys.index(item['from'])
        safe_targets = {stage_keys[source_index + 1]} if source_index + 1 < len(stage_keys) else {'cerrado'}
        if kind == 'compensatorio' and item['from'] == 'autorizacion_compensatorio':
            safe_targets.add('cierre')
        if item['to'] not in safe_targets:
            raise ValidationError('La transición omite controles obligatorios o apunta a un estado no permitido.')
        expected_roles = config.get('roles', {}).get(item['from'], stages[item['from']]['roles'])
        if not valid_stage_roles(item['roles'], expected_roles, valid_roles):
            raise ValidationError('Los roles de transición no son válidos para esa etapa.')
        if item['roles'] != expected_roles:
            raise ValidationError('Los roles de la transición deben coincidir con los responsables configurados para la etapa.')
        seen.add(identity)
    rules = config.get('compensatory_rules', {})
    if kind != 'compensatorio' and rules:
        raise ValidationError('compensatory_rules solo aplica a Gestión de Compensatorios.')
    if kind == 'compensatorio':
        allowed_rules = {'enabled', 'minutes_per_day', 'min_credit_minutes', 'max_credit_minutes', 'min_request_minutes', 'max_request_minutes', 'requirements', 'approval_conditions'}
        if not isinstance(rules, dict) or set(rules) - allowed_rules:
            raise ValidationError('La configuración de compensatorios contiene reglas desconocidas.')
        if rules.get('enabled') is True:
            for key in ['minutes_per_day', 'min_credit_minutes', 'max_credit_minutes', 'min_request_minutes', 'max_request_minutes']:
                if type(rules.get(key)) is not int or not 1 <= rules[key] <= 100000:
                    raise ValidationError(f'{key} debe ser un entero positivo cuando el reconocimiento está habilitado.')
            if rules['min_credit_minutes'] > rules['max_credit_minutes'] or rules['min_request_minutes'] > rules['max_request_minutes']:
                raise ValidationError('Los límites mínimos no pueden superar los máximos.')
            for key in ['requirements', 'approval_conditions']:
                if not isinstance(rules.get(key), list) or not rules[key] or any(not isinstance(value, str) or not value.strip() for value in rules[key]):
                    raise ValidationError(f'{key} requiere una lista no vacía de textos verificados.')
        elif rules and rules.get('enabled') not in {False, None}:
            raise ValidationError('enabled debe ser verdadero o falso.')
