"""Proposed administrative workflow; official sources still require institutional review."""
from copy import deepcopy
from .models import ROLES

# key, label, type, choices. Requiredness belongs to the current stage.
FIELDS = {
    'start_date': ('Fecha de inicio / salida', 'date'),
    'end_date': ('Fecha de terminación / regreso', 'date'),
    'leave_type': ('Tipo de incapacidad o licencia', 'choice', [('comun', 'Enfermedad común'), ('accidente', 'Accidente de trabajo'), ('laboral', 'Enfermedad laboral'), ('maternidad', 'Maternidad'), ('paternidad', 'Paternidad')]),
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
    'resolution_date': ('Fecha de resolución', 'date'),
    'archive_reference': ('Referencia de incorporación al expediente', 'text'),
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
}
DOCS = {
    'certificado': 'Certificado médico', 'soporte_solicitud': 'Soportes de la solicitud',
    'proyecto': 'Proyecto de resolución', 'concepto_juridico': 'Concepto jurídico',
    'acto_firmado': 'Resolución firmada', 'archivo': 'Constancia de incorporación al expediente',
    'pago_funcionario': 'Soporte de pago al funcionario', 'transcripcion': 'Evidencia de transcripción y radicación',
    'solicitud_recobro': 'Solicitud de recobro radicada', 'reconocimiento': 'Reconocimiento o decisión de la entidad',
    'recuperacion': 'Soporte de recuperación', 'comunicacion_financiera': 'Comunicación al área financiera',
    'registro_contable': 'Comprobante contable', 'conciliacion': 'Soporte de conciliación',
    'gestion_saldos': 'Comunicaciones y gestión de saldos', 'control_interno': 'Revisión de Control Interno',
    'cierre': 'Constancia de cierre', 'autorizacion_comision': 'Autorización de comisión',
    'solicitud_cdp': 'Solicitud de CDP', 'solicitud_rp': 'Solicitud de RP', 'cdp': 'CDP oficial registrado', 'rp': 'RP oficial registrado', 'liquidacion': 'Soporte de liquidación',
    'orden_pago': 'Orden de pago', 'desembolso': 'Soporte de desembolso',
    'informe_comision': 'Informe y evidencias de comisión', 'gastos': 'Soportes de gastos ejecutados',
    'revision_legalizacion': 'Revisión de legalización', 'reintegro': 'Soporte de reintegro',
}

def s(key, label, roles, fields=(), docs=()):
    return {'key': key, 'label': label, 'roles': list(roles), 'fields': list(fields), 'docs': list(docs)}

ACT = [
    s('proyecto', 'Proyecto de resolución', ['talento'], ['draft_text'], ['proyecto']),
    s('juridica', 'Revisión jurídica', ['juridica'], ['legal_note'], ['concepto_juridico']),
    s('autorizacion', 'Aprobación y acto firmado', ['autoridad'], ['resolution_number', 'resolution_date'], ['acto_firmado']),
]
INC = [
    s('borrador', 'Registro de incapacidad', ['owner'], ['start_date', 'end_date', 'leave_type', 'entity'], ['certificado']),
    s('revision', 'Verificación de requisitos', ['talento'], ['review_note']),
    *ACT,
    s('archivo', 'Incorporación al expediente', ['secretaria'], ['archive_reference'], ['archivo']),
    s('pago_funcionario', 'Pago al funcionario', ['tesoreria'], ['employee_paid', 'employee_paid_on', 'employee_payment_ref'], ['pago_funcionario']),
    s('transcripcion', 'Transcripción ante EPS / ARL', ['talento'], ['filing_entity', 'filing_number', 'filing_date', 'filing_result'], ['transcripcion']),
    s('recobro', 'Solicitud de recobro', ['talento'], ['requested', 'recovery_reference', 'recovery_date'], ['solicitud_recobro']),
    s('seguimiento', 'Seguimiento y reconocimiento', ['talento'], ['recognized', 'recognition_date', 'followup_note'], ['reconocimiento']),
    s('recaudo', 'Registro de recuperación', ['tesoreria']),
    s('comunicacion', 'Comunicación a financiera', ['tesoreria'], ['finance_notice'], ['comunicacion_financiera']),
    s('contabilidad', 'Registro contable', ['contabilidad'], ['accounting_reference'], ['registro_contable']),
    s('conciliacion', 'Conciliación interna', ['contabilidad'], ['reconciliation_note'], ['conciliacion']),
    s('saldos', 'Gestión de saldos', ['talento'], ['balance_note'], ['gestion_saldos']),
    s('control', 'Revisión de Control Interno', ['control'], ['control_note'], ['control_interno']),
    s('cierre', 'Cierre del procedimiento', ['talento'], ['closure_note'], ['cierre']),
]
VIA = [
    s('borrador', 'Solicitud de comisión', ['owner'], ['start_date', 'end_date', 'purpose', 'destination', 'category', 'transport'], ['soporte_solicitud']),
    s('revision', 'Revisión de solicitud', ['talento'], ['review_note']),
    s('autorizacion_inicial', 'Autorización de comisión', ['autoridad'], ['initial_authorization'], ['autorizacion_comision']),
    s('solicitud_cdp', 'Solicitud de disponibilidad', ['talento'], ['cdp_request_ref', 'cdp_request_date'], ['solicitud_cdp']),
    s('cdp', 'Disponibilidad y CDP', ['presupuesto'], ['cdp_number', 'cdp_date', 'cdp_amount'], ['cdp']),
    s('liquidacion', 'Liquidación de viáticos', ['talento'], ['scale_id', 'overnight_days', 'day_days', 'authorized_transport'], ['liquidacion']),
    *ACT,
    s('solicitud_rp', 'Solicitud de registro presupuestal', ['talento'], ['rp_request_ref', 'rp_request_date'], ['solicitud_rp']),
    s('rp', 'Registro presupuestal', ['presupuesto'], ['rp_number', 'rp_date', 'rp_amount'], ['rp']),
    s('orden_pago', 'Orden de pago', ['tesoreria'], ['payment_order'], ['orden_pago']),
    s('pago', 'Desembolso', ['tesoreria']),
    s('comision', 'Ejecución de la comisión', ['owner'], ['commission_report'], ['informe_comision']),
    s('legalizacion', 'Legalización de gastos', ['owner'], ['executed', 'legalization_note'], ['gastos']),
    s('revision_legalizacion', 'Revisión de legalización', ['talento'], ['legalization_review'], ['revision_legalizacion']),
    s('conciliacion', 'Conciliación financiera y reintegros', ['contabilidad'], ['reconciliation_note'], ['conciliacion']),
    s('cierre', 'Cierre del expediente', ['secretaria'], ['closure_note'], ['cierre']),
]
WORKFLOWS = {'incapacidad': INC, 'viatico': VIA}


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


def actor_for(user, case, step=None):
    step = step or editable_step(case)
    if not step:
        return False
    roles = set(step['roles'])
    return ('owner' in roles and user.pk == case.owner_id) or bool(role_names(user) & (roles - {'owner'}))


def stage_label(case):
    if case.stage == 'cerrado':
        return 'Cerrado'
    if case.stage == 'rechazado':
        return 'Rechazado'
    if case.stage == 'correccion':
        return 'Corrección · ' + correction_step(case)['label']
    step = current_step(case)
    return step['label'] if step else case.stage


def validate_config(kind, config):
    from django.core.exceptions import ValidationError
    if not isinstance(config, dict) or set(config) - {'roles', 'deadlines', 'additional_documents', 'milestones'}:
        raise ValidationError('La configuración admite roles, deadlines, additional_documents y milestones.')
    stages = {s['key']: s for s in WORKFLOWS[kind]}
    valid_roles = {r[0] for r in ROLES} - {'administrador', 'solicitante'}
    for key in ['roles', 'deadlines', 'additional_documents']:
        if not isinstance(config.get(key, {}), dict):
            raise ValidationError(f'{key} debe ser un objeto.')
        for stage, value in config.get(key, {}).items():
            if stage not in stages:
                raise ValidationError(f'Etapa desconocida: {stage}')
            if key == 'roles':
                expected_owner = 'owner' in stages[stage]['roles']
                if not isinstance(value, list) or not value or any(r not in valid_roles | {'owner'} for r in value) or (expected_owner and value != ['owner']) or (not expected_owner and 'owner' in value):
                    raise ValidationError('Los roles deben ser institucionales; las etapas del solicitante deben conservar owner.')
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
