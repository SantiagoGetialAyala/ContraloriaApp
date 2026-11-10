from django.db.models import Prefetch, Q
from django.core.exceptions import PermissionDenied
from .models import Case, Event
from .workflows import role_names

MEDICAL = {'certificado', 'epicrisis'}
FINANCE = {'pago_funcionario', 'recuperacion', 'comunicacion_financiera', 'registro_contable', 'conciliacion', 'gestion_saldos', 'solicitud_cdp', 'solicitud_rp', 'cdp', 'rp', 'liquidacion', 'orden_pago', 'desembolso', 'gastos', 'reintegro', 'cierre', 'acto_firmado', 'autorizacion_comision', 'soporte_solicitud'}


def visible_cases(user):
    roles = role_names(user)
    query = Q(owner=user)
    if roles & {'talento', 'juridica', 'secretaria', 'autoridad', 'control', 'tesoreria', 'contabilidad'}:
        query |= ~Q(stage='borrador')
    elif 'presupuesto' in roles:
        query |= Q(kind='viatico') & ~Q(stage='borrador')
    # El jefe inmediato solo ve las vacaciones enviadas de su equipo, no sus incapacidades ni viáticos.
    query |= Q(kind='vacaciones', owner__profile__dependencia__jefe=user) & ~Q(stage='borrador')
    return Case.objects.filter(query).select_related('owner', 'owner__profile', 'policy').prefetch_related(
        Prefetch('events', queryset=Event.objects.filter(action__in=[
            'Etapa completada', 'Devuelto para corrección', 'Movimiento financiero registrado',
        ]).only('id', 'case_id', 'action', 'before', 'after', 'created_at').order_by('created_at', 'id'),
            to_attr='workflow_events'),
    )


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
    if case.kind == 'vacaciones':
        from .vacations import is_superior
        if is_superior(user, case.owner):
            return True
    return bool(roles & {'tesoreria', 'contabilidad', 'presupuesto'}) and document.category in FINANCE


def require_role(user, role):
    if role not in role_names(user):
        raise PermissionDenied('No tiene el rol requerido para esta acción.')


def require_personnel_manager(user):
    if not role_names(user) & {'administrador', 'talento'}:
        raise PermissionDenied('La gestión de hojas de vida corresponde a Talento Humano y Administración.')
