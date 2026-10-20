from django.db.models import Q
from django.core.exceptions import PermissionDenied
from .models import Case
from .workflows import role_names

MEDICAL = {'certificado'}
FINANCE = {'pago_funcionario', 'recuperacion', 'comunicacion_financiera', 'registro_contable', 'conciliacion', 'gestion_saldos', 'solicitud_cdp', 'solicitud_rp', 'cdp', 'rp', 'liquidacion', 'orden_pago', 'desembolso', 'gastos', 'reintegro', 'cierre', 'acto_firmado', 'autorizacion_comision', 'soporte_solicitud'}


def visible_cases(user):
    roles = role_names(user)
    query = Q(owner=user)
    if roles & {'talento', 'juridica', 'secretaria', 'autoridad', 'control', 'tesoreria', 'contabilidad'}:
        query |= ~Q(stage='borrador')
    elif 'presupuesto' in roles:
        query |= Q(kind='viatico') & ~Q(stage='borrador')
    return Case.objects.filter(query).select_related('owner', 'policy')


def get_case(user, case_id):
    from django.shortcuts import get_object_or_404
    return get_object_or_404(visible_cases(user), pk=case_id)


def can_document(user, document):
    roles = role_names(user)
    case = document.case
    if case.owner_id == user.pk:
        return True
    if document.category in MEDICAL or (case.kind == 'incapacidad' and document.category == 'soporte_solicitud'):
        return 'talento' in roles
    if roles & {'talento', 'juridica', 'secretaria', 'autoridad', 'control'}:
        return True
    return bool(roles & {'tesoreria', 'contabilidad', 'presupuesto'}) and document.category in FINANCE


def require_role(user, role):
    if role not in role_names(user):
        raise PermissionDenied('No tiene el rol requerido para esta acción.')
