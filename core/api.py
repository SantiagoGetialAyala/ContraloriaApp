import hashlib
import json
from datetime import date, timedelta
from decimal import Decimal
from django.conf import settings
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.forms import AuthenticationForm, PasswordChangeForm
from django.contrib.auth.models import Group, User
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.paginator import Paginator
from django.db import transaction
from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import ensure_csrf_cookie
from .access import can_document, get_case, require_role, visible_cases
from .forms import (
    BASE_FIELDS,
    CaseDataForm,
    DecisionForm,
    PaymentForm,
    PolicyForm,
    RecognitionForm,
    ScaleForm,
    SetupForm,
    UploadForm,
    UserAccessForm,
    UserForm,
    VacationInterruptionForm,
)
from .models import (
    KINDS,
    ROLES,
    Case,
    CompensatoryLedgerEntry,
    Event,
    LoginAttempt,
    PolicyVersion,
    Profile,
    TravelScale,
)
from . import services, vacations
from .views import KIND_TITLES, ROLE_LABELS, decorate, filtered_cases, record_failure
from .workflows import (
    DOCS,
    FIELDS,
    WORKFLOWS,
    actor_for,
    actor_for_transition,
    editable_step,
    role_names,
    stage_label,
    workflow,
)


class FieldSchemaBuilder:
    """Construye de forma orientada a objetos el esquema declarativo de campos para el frontend."""

    @classmethod
    def build(cls, keys, initial_data=None):
        initial_data = initial_data or {}
        scales = None
        schema = []
        for key in keys:
            if key not in FIELDS:
                continue
            definition = FIELDS[key]
            label = definition[0]
            field_type = definition[1]
            choices = []
            if field_type == 'choice' and len(definition) > 2:
                choices = [[c[0], c[1]] for c in definition[2]]
            elif field_type == 'scale':
                if scales is None:
                    scales = [[str(s.pk), str(s)] for s in TravelScale.objects.all()]
                choices = scales
            raw_val = initial_data.get(key)
            if field_type == 'bool':
                val = bool(raw_val) if raw_val is not None else False
            else:
                val = '' if raw_val is None else str(raw_val)
            schema.append({
                'key': key,
                'label': label,
                'type': field_type,
                'choices': choices,
                'value': val,
            })
        return schema


class CaseSerializer:
    """Serializador orientado a objetos para transformar expedientes y su contexto en DTOs JSON."""

    FINANCIAL_KEYS = {
        'start_date', 'end_date', 'days', 'incapacity_number', 'radication_number',
        'epicrisis_radication', 'resolution_number', 'resolution_radication',
        'resolution_date', 'payer_entity', 'requested', 'recognized',
        'employee_paid', 'employee_paid_on', 'employee_payment_ref',
        'finance_notice', 'accounting_reference', 'reconciliation_note',
        'balance_note', 'closure_note',
    }

    @classmethod
    def serialize_totals(cls, case):
        raw = services.totals(case)
        return {k: str(v) for k, v in raw.items()}

    @classmethod
    def serialize_summary(cls, case):
        decorate(case)
        employment = ''
        if hasattr(case.owner, 'profile'):
            employment = case.owner.profile.get_employment_display()
        return {
            'id': str(case.pk),
            'kind': case.kind,
            'kind_display': case.get_kind_display(),
            'reference': case.reference,
            'owner': {
                'id': case.owner_id,
                'username': case.owner.username,
                'full_name': case.owner.get_full_name() or case.owner.username,
                'employment': employment,
            },
            'department': case.department,
            'stage': case.stage,
            'stage_label': case.stage_label,
            'progress': case.progress,
            'overdue': case.overdue,
            'due_at': case.due_at.isoformat() if case.due_at else None,
            'revision': case.revision,
            'policy_version': case.policy.version,
            'policy_confirmed': case.policy.confirmed,
            'created_at': case.created_at.isoformat(),
            'updated_at': case.updated_at.isoformat(),
            'data': case.data,
            'totals': cls.serialize_totals(case),
            'compensatory': services.compensatory_summary(case) if case.kind == 'compensatorio' else None,
        }

    @classmethod
    def serialize_detail(cls, request, case):
        summary = cls.serialize_summary(case)
        user = request.user
        step = editable_step(case)
        if step:
            step['role_labels'] = [ROLE_LABELS.get(r, r) for r in step['roles']]
        can_edit = actor_for(user, case) or actor_for_transition(user, case)
        keys = BASE_FIELDS[case.kind] if step and step['key'] == 'borrador' else (step['fields'] if step else [])
        steps = workflow(case)
        index = next((i for i, s in enumerate(steps) if step and s['key'] == step['key']), len(steps))
        serialized_steps = []
        for i, s in enumerate(steps):
            serialized_steps.append({
                'key': s['key'],
                'label': s['label'],
                'done': i < index or case.stage == 'cerrado',
                'current': i == index and case.stage not in services.TERMINAL,
                'role_labels': [ROLE_LABELS.get(r, r) for r in s['roles']],
            })

        roles = role_names(user)
        full = case.owner_id == user.pk or bool(roles & {'talento', 'juridica', 'secretaria', 'autoridad', 'control'})
        values = []
        for k, v in case.data.items():
            if k not in FIELDS or (not full and case.kind == 'incapacidad' and k not in cls.FINANCIAL_KEYS) or v == '' or v is None:
                continue
            definition = FIELDS[k]
            display_val = v
            if definition[1] == 'choice':
                display_val = dict(definition[2]).get(v, v)
            elif isinstance(v, bool):
                display_val = 'Sí' if v else 'No'
            values.append({'key': k, 'label': definition[0], 'value': str(display_val)})

        documents = []
        for d in case.documents.defer('content').select_related('uploaded_by'):
            if can_document(user, d):
                documents.append({
                    'id': d.pk,
                    'category': d.category,
                    'label': DOCS.get(d.category, d.category),
                    'name': d.name,
                    'size': d.size,
                    'sha256': d.sha256,
                    'uploaded_by': d.uploaded_by.get_full_name() or d.uploaded_by.username,
                    'created_at': d.created_at.isoformat(),
                    'preview_url': reverse('document_preview', args=[d.pk]),
                    'download_url': reverse('document_download', args=[d.pk]),
                })

        upload_cats = [
            {'key': c, 'label': DOCS.get(c, c)}
            for c in services.upload_categories(user, case)
        ]

        treasury_ok = services.treasury_allowed(user, case)
        payment_options = None
        if treasury_ok:
            pay_kinds = (
                [['recuperacion', 'Recuperación de recobro']]
                if case.kind == 'incapacidad'
                else [['desembolso', 'Desembolso de viáticos'], ['reintegro', 'Reintegro de viáticos']]
            )
            valid_cats = [x[0] for x in pay_kinds]
            evidences = [
                {
                    'id': d.pk,
                    'category': d.category,
                    'label': f"{DOCS.get(d.category, d.category)} · {d.name} · {d.created_at:%d/%m/%Y %H:%M}",
                }
                for d in case.documents.filter(category__in=valid_cats).defer('content')
            ]
            payment_options = {'kinds': pay_kinds, 'evidences': evidences}

        financial_entries = [
            {
                'id': e.pk,
                'kind': e.kind,
                'kind_display': e.get_kind_display(),
                'amount': str(e.amount),
                'paid_on': e.paid_on.isoformat(),
                'reference': e.reference,
                'actor': e.actor.get_full_name() or e.actor.username,
                'evidence_id': e.evidence_id,
                'download_url': reverse('document_download', args=[e.evidence_id]),
            }
            for e in case.financial_entries.select_related('actor').all()
        ]

        ledger_entries = []
        if case.kind == 'compensatorio':
            for entry in case.owner.compensatory_ledger.select_related('case', 'actor'):
                ledger_entries.append({
                    'id': entry.pk,
                    'kind': entry.kind,
                    'kind_display': entry.get_kind_display(),
                    'effective_on': entry.effective_on.isoformat(),
                    'minutes': entry.minutes,
                    'rule_reference': entry.rule_reference,
                    'case_id': str(entry.case_id),
                    'case_reference': entry.case.reference,
                    'actor': entry.actor.get_full_name() or entry.actor.username,
                })

        can_recognize = case.kind == 'incapacidad' and 'talento' in roles and case.stage in {'transcripcion', 'comprobante'}
        recognition_docs = []
        if can_recognize:
            recognition_docs = [
                {'id': d.pk, 'label': f"{d.name} · {d.created_at:%d/%m/%Y %H:%M}"}
                for d in case.documents.filter(category='reconocimiento').defer('content')
            ]

        vacation_data = None
        if case.kind == 'vacaciones':
            periods, problem = [], None
            try:
                for row in vacations.period_summary(case.owner):
                    periods.append({
                        'number': row['period'].number,
                        'label': row['period'].label,
                        'balance': row['balance'],
                        'reserved': row['reserved'],
                        'prescribes_on': row['prescribes_on'].isoformat(),
                        'prescribed': row['prescribed'],
                    })
            except ValidationError as exc:
                problem = ' '.join(exc.messages)
            can_interrupt = services.can_interrupt_vacation(user, case)
            interruption_docs = []
            if can_interrupt:
                interruption_docs = [
                    {'id': d.pk, 'label': f"{d.name} · {d.created_at:%d/%m/%Y %H:%M}"}
                    for d in case.documents.filter(category='novedad_vacaciones').defer('content')
                ]
            vacation_data = {
                'periods': periods,
                'problem': problem,
                'entries': [
                    {
                        'id': entry.pk,
                        'kind': entry.kind,
                        'kind_display': entry.get_kind_display(),
                        'effective_on': entry.effective_on.isoformat(),
                        'days': entry.days,
                        'period_label': entry.period.label,
                        'actor': entry.actor.get_full_name() or entry.actor.username,
                    }
                    for entry in case.vacation_entries.select_related('period', 'actor')
                ],
                'can_interrupt': can_interrupt,
                'interruption_documents': interruption_docs,
            }

        events_qs = case.events.select_related('actor').order_by('-created_at', '-id')
        event_page = Paginator(events_qs, 30).get_page(request.GET.get('history_page'))
        events_data = {
            'page': event_page.number,
            'num_pages': event_page.paginator.num_pages,
            'has_previous': event_page.has_previous(),
            'has_next': event_page.has_next(),
            'items': [
                {
                    'id': e.pk,
                    'action': e.action,
                    'actor': (e.actor.get_full_name() or e.actor.username) if e.actor else 'Acceso sin autenticar',
                    'created_at': e.created_at.isoformat(),
                    'before': e.before,
                    'after': e.after,
                    'note': e.note if full else '',
                    'details': e.details if full else None,
                }
                for e in event_page.object_list
            ],
        }

        return {
            **summary,
            'correction_fields': case.correction_fields,
            'can_edit': can_edit,
            'can_return': bool(can_edit and case.stage not in {'borrador', 'correccion'} and step and 'owner' not in step['roles']),
            'can_reject': bool(can_edit and case.stage in {'revision', 'revision_soportes'}),
            'full_access': full,
            'treasury_allowed': treasury_ok,
            'can_recognize': can_recognize,
            'step': step,
            'steps': serialized_steps,
            'fields_schema': FieldSchemaBuilder.build(keys, case.data) if can_edit else [],
            'required_documents': [DOCS[d] for d in step['docs']] if step else [],
            'upload_categories': upload_cats,
            'documents': documents,
            'values': values,
            'financial_entries': financial_entries,
            'payment_options': payment_options,
            'recognition_documents': recognition_docs,
            'ledger_entries': ledger_entries,
            'vacation': vacation_data,
            'events': events_data,
        }


class BaseApiView(View):
    """Clase base orientada a objetos para todas las vistas de la API JSON."""

    require_authentication = True
    required_role = None

    def parse_body(self, request):
        if request.content_type and 'application/json' in request.content_type:
            try:
                return json.loads(request.body.decode('utf-8') or '{}')
            except json.JSONDecodeError:
                raise ValidationError('El cuerpo JSON de la solicitud no es válido.')
        return request.POST.dict()

    def json_success(self, data=None, message=None, status=200):
        payload = {'ok': True}
        if message:
            payload['message'] = message
        if data is not None:
            payload['data'] = data
        return JsonResponse(payload, status=status)

    def json_error(self, errors, field_errors=None, status=400):
        if isinstance(errors, str):
            errors = [errors]
        return JsonResponse(
            {
                'ok': False,
                'errors': list(errors),
                'field_errors': field_errors or {},
            },
            status=status,
        )

    def format_form_errors(self, form):
        general = [str(e) for e in form.non_field_errors()]
        fields = {}
        for name, errs in form.errors.items():
            if name == '__all__':
                continue
            fields[name] = [str(e) for e in errs]
            label = form.fields[name].label if name in form.fields and form.fields[name].label else name
            for err in errs:
                general.append(f'{label}: {err}')
        if not general:
            general = ['Verifique los datos ingresados en el formulario.']
        return general, fields

    def dispatch(self, request, *args, **kwargs):
        try:
            if self.require_authentication and not request.user.is_authenticated:
                return self.json_error('Sesión requerida. Ingrese nuevamente.', status=401)
            if self.required_role:
                require_role(request.user, self.required_role)
            return super().dispatch(request, *args, **kwargs)
        except ValidationError as exc:
            record_failure(request, exc, getattr(self, 'current_case', None))
            return self.json_error(exc.messages, status=400)
        except PermissionDenied as exc:
            record_failure(request, exc, getattr(self, 'current_case', None))
            msg = str(exc) or 'Su usuario no tiene permisos para realizar esta acción.'
            return self.json_error(msg, status=403)
        except Http404:
            return self.json_error('No encontramos el recurso solicitado.', status=404)


@method_decorator(ensure_csrf_cookie, name='dispatch')
class SessionApiView(BaseApiView):
    """Devuelve el estado actual de la sesión, usuario y permisos de navegación."""

    require_authentication = False

    def get(self, request):
        needs_setup = not User.objects.exists()
        if not request.user.is_authenticated:
            return self.json_success({
                'authenticated': False,
                'needs_setup': needs_setup,
                'user': None,
            })
        user = request.user
        roles = role_names(user)
        department = user.profile.department if hasattr(user, 'profile') else ''
        employment = user.profile.get_employment_display() if hasattr(user, 'profile') else ''
        return self.json_success({
            'authenticated': True,
            'needs_setup': False,
            'user': {
                'id': user.pk,
                'username': user.username,
                'full_name': user.get_full_name() or user.username,
                'department': department,
                'employment': employment,
                'roles': sorted(roles),
                'role_labels': [label for key, label in ROLES if key in roles],
                'nav_admin': 'administrador' in roles,
                'nav_authority': 'autoridad' in roles,
                'can_configure': bool(roles & {'autoridad', 'administrador', 'talento', 'presupuesto', 'control'}),
            },
        })


class SetupApiView(BaseApiView):
    """Configuración del primer administrador local."""

    require_authentication = False

    def post(self, request):
        if User.objects.exists():
            return self.json_error('La configuración inicial ya fue realizada.', status=400)
        if settings.PRODUCTION or request.META.get('REMOTE_ADDR') not in {'127.0.0.1', '::1'}:
            raise PermissionDenied('La configuración inicial web solo está disponible localmente.')
        body = self.parse_body(request)
        form = SetupForm(body)
        if not form.is_valid():
            errors, field_errors = self.format_form_errors(form)
            return self.json_error(errors, field_errors, status=400)
        with transaction.atomic():
            if User.objects.exists():
                return self.json_error('La configuración inicial ya fue realizada.', status=400)
            data = form.cleaned_data
            user = User.objects.create_user(data['username'], password=data['password'], first_name=data['name'])
            services.apply_profile(Profile.objects.create(user=user), data)
            user.groups.add(Group.objects.get_or_create(name='administrador')[0])
            services.audit(None, user, 'Administrador inicial creado')
        login(request, user)
        return self.json_success(message='Administrador creado. Registre los usuarios y asigne sus roles.')


class LoginApiView(BaseApiView):
    """Autenticación de usuario con protección por intentos fallidos."""

    require_authentication = False

    def post(self, request):
        if not User.objects.exists():
            return self.json_error('Primero debe configurar el administrador inicial.', status=400)
        body = self.parse_body(request)
        username = str(body.get('username', ''))[:150]
        key = hashlib.sha256((request.META.get('REMOTE_ADDR', '') + '|' + username.casefold()).encode()).hexdigest()
        now = timezone.now()
        attempt = LoginAttempt.objects.filter(key=key).first()
        if attempt and attempt.failures >= 5 and attempt.last_attempt > now - timedelta(minutes=15):
            return self.json_error('Demasiados intentos. Intente nuevamente en 15 minutos.', status=429)
        form = AuthenticationForm(request, data=body)
        if form.is_valid():
            login(request, form.get_user())
            LoginAttempt.objects.filter(key=key).delete()
            services.audit(None, request.user, 'Inicio de sesión')
            return self.json_success(message='Sesión iniciada correctamente.')
        with transaction.atomic():
            attempt, _ = LoginAttempt.objects.get_or_create(key=key, defaults={'last_attempt': now})
            if attempt.last_attempt < now - timedelta(minutes=15):
                attempt.failures = 0
            attempt.failures += 1
            attempt.last_attempt = now
            attempt.save()
        services.audit(None, None, 'Inicio de sesión rechazado', result='rechazado', attempt_key=key)
        return self.json_error('Usuario o contraseña incorrectos.', status=400)


class LogoutApiView(BaseApiView):
    """Cierre de sesión."""

    def post(self, request):
        services.audit(None, request.user, 'Cierre de sesión')
        logout(request)
        return self.json_success(message='Sesión finalizada.')


class PasswordChangeApiView(BaseApiView):
    """Cambio de contraseña de la cuenta activa."""

    def post(self, request):
        body = self.parse_body(request)
        form = PasswordChangeForm(request.user, body)
        if not form.is_valid():
            errors, field_errors = self.format_form_errors(form)
            return self.json_error(errors, field_errors, status=400)
        user = form.save()
        update_session_auth_hash(request, user)
        services.audit(None, user, 'Contraseña actualizada')
        return self.json_success(message='Contraseña actualizada.')


class DashboardApiView(BaseApiView):
    """Panel general con indicadores, bandeja de trabajo, alertas y resumen financiero."""

    def get(self, request):
        cases = list(filtered_cases(request, None).prefetch_related('financial_entries'))
        stats = {
            'total': len(cases),
            'active': 0,
            'closed': 0,
            'review': 0,
            'overdue': 0,
            'rejected': 0,
            'recovered': Decimal('0'),
            'pending': Decimal('0'),
            'committed': Decimal('0'),
            'executed': Decimal('0'),
            'payments': Decimal('0'),
            'legalizations': 0,
            'approved_trips': 0,
            'inc_review': 0,
            'inc_recoveries': 0,
            'trip_rejected': 0,
            'trip_commissions': 0,
            'trip_paid': 0,
            'comp_pending': 0,
            'comp_authorized': 0,
            'comp_balance': 0,
        }
        tasks, alerts = [], []
        kinds = {
            'incapacidad': {'name': 'Incapacidades', 'count': 0, 'closed': 0},
            'viatico': {'name': 'Viáticos', 'count': 0, 'closed': 0},
            'compensatorio': {'name': 'Compensatorios', 'count': 0, 'closed': 0},
            'vacaciones': {'name': 'Vacaciones', 'count': 0, 'closed': 0},
        }
        for vac_alert in vacations.alerts(request.user, cases):
            vac_case = vac_alert.get('case')
            alerts.append({
                'case_id': str(vac_case.pk) if vac_case else None,
                'reference': vac_case.reference if vac_case else '',
                'label': vac_alert['label'],
                'date': vac_alert['date'].isoformat() if vac_alert.get('date') else '',
            })
        for case in cases:
            decorate(case)
            kinds[case.kind]['count'] += 1
            if case.stage == 'cerrado':
                stats['closed'] += 1
                kinds[case.kind]['closed'] += 1
            elif case.stage == 'rechazado':
                stats['rejected'] += 1
            else:
                stats['active'] += 1
            if case.stage == 'revision':
                stats['review'] += 1
            if case.overdue:
                stats['overdue'] += 1
                alerts.append({
                    'case_id': str(case.pk),
                    'reference': case.reference,
                    'label': 'Plazo de etapa vencido',
                    'date': case.due_at.date().isoformat() if case.due_at else '',
                })
            if case.stage == 'correccion':
                alerts.append({
                    'case_id': str(case.pk),
                    'reference': case.reference,
                    'label': 'Documentación por corregir',
                    'date': case.updated_at.date().isoformat(),
                })
            if actor_for(request.user, case) or actor_for_transition(request.user, case):
                tasks.append(case)
                step = editable_step(case)
                existing = set(case.documents.values_list('category', flat=True))
                missing = [DOCS[k] for k in step['docs'] if k not in existing]
                if missing:
                    alerts.append({
                        'case_id': str(case.pk),
                        'reference': case.reference,
                        'label': 'Faltan documentos: ' + ', '.join(missing),
                        'date': case.updated_at.date().isoformat(),
                    })
            money = services.totals(case)
            if case.kind == 'incapacidad':
                if case.stage == 'revision':
                    stats['inc_review'] += 1
                if money['pending'] > 0:
                    stats['inc_recoveries'] += 1
                stats['recovered'] += money['recovered']
                stats['pending'] += money['pending']
                if case.data.get('start_date') and case.stage not in services.TERMINAL:
                    for milestone in case.policy.config.get('milestones', []):
                        when = date.fromisoformat(case.data['start_date']) + timedelta(days=milestone['day'] - 1)
                        if when <= timezone.localdate() and (case.owner_id == request.user.pk or milestone['role'] in role_names(request.user)):
                            alerts.append({
                                'case_id': str(case.pk),
                                'reference': case.reference,
                                'label': milestone['label'],
                                'date': when.isoformat(),
                            })
            elif case.kind == 'viatico':
                if case.stage == 'rechazado':
                    stats['trip_rejected'] += 1
                if case.stage == 'comision':
                    stats['trip_commissions'] += 1
                if money['paid'] > 0:
                    stats['trip_paid'] += 1
                stats['committed'] += money['committed']
                stats['executed'] += money['executed']
                stats['payments'] += money['paid']
                if case.events.filter(action='Etapa completada', before='autorizacion').exists():
                    stats['approved_trips'] += 1
                if case.stage in {'comision', 'legalizacion', 'revision_legalizacion', 'conciliacion'}:
                    stats['legalizations'] += 1
            elif case.kind == 'compensatorio':
                if case.stage in {'revision_soportes', 'validacion_saldo', 'autorizacion_tiempo', 'autorizacion_compensatorio'}:
                    stats['comp_pending'] += 1
                if case.compensatory_entries.filter(kind='debito').exists():
                    stats['comp_authorized'] += 1

        stats['comp_balance'] = services.compensatory_balance(request.user)['balance']
        provisional = PolicyVersion.objects.filter(confirmed=False).exists() or not PolicyVersion.objects.exists()
        serialized_stats = {k: str(v) if isinstance(v, Decimal) else v for k, v in stats.items()}
        return self.json_success({
            'today': timezone.localdate().isoformat(),
            'provisional': provisional,
            'task_count': len(tasks),
            'stats': serialized_stats,
            'kinds': kinds,
            'tasks': [CaseSerializer.serialize_summary(c) for c in tasks[:8]],
            'recent': [CaseSerializer.serialize_summary(c) for c in cases[:6]],
            'alerts': alerts[:8],
        })


class CaseModuleApiView(BaseApiView):
    """Listado filtrado/paginado por módulo y creación de nuevos borradores."""

    TITLES = KIND_TITLES
    CREATE_TITLES = {
        'incapacidad': 'Nueva incapacidad',
        'viatico': 'Nueva comisión',
        'compensatorio': 'Nuevo registro de tiempo trabajado',
        'vacaciones': 'Nueva solicitud de vacaciones',
    }

    def validate_kind(self, kind):
        if kind not in WORKFLOWS:
            raise Http404

    def get(self, request, kind):
        self.validate_kind(kind)
        if request.GET.get('schema') == '1':
            return self.json_success({
                'kind': kind,
                'title': self.CREATE_TITLES[kind],
                'fields_schema': FieldSchemaBuilder.build(BASE_FIELDS[kind]),
            })
        queryset = filtered_cases(request, kind)
        page_obj = Paginator(queryset, 15).get_page(request.GET.get('page'))
        states = [[s['key'], s['label']] for s in WORKFLOWS[kind]] + [
            ['correccion', 'En corrección'],
            ['cerrado', 'Cerrado'],
            ['rechazado', 'Rechazado'],
        ]
        query = request.GET.copy()
        query.pop('page', None)
        query_str = query.urlencode()
        report_url = reverse('report', args=[kind]) + (f'?{query_str}' if query_str else '')
        return self.json_success({
            'kind': kind,
            'title': self.TITLES[kind],
            'count': queryset.count(),
            'states': states,
            'report_url': report_url,
            'page': page_obj.number,
            'num_pages': page_obj.paginator.num_pages,
            'has_previous': page_obj.has_previous(),
            'has_next': page_obj.has_next(),
            'cases': [CaseSerializer.serialize_summary(c) for c in page_obj.object_list],
            'fields_schema': FieldSchemaBuilder.build(BASE_FIELDS[kind]),
        })

    def post(self, request, kind):
        self.validate_kind(kind)
        body = self.parse_body(request)
        body.setdefault('revision', 1)
        form = CaseDataForm(body, keys=BASE_FIELDS[kind])
        if not form.is_valid():
            errors, field_errors = self.format_form_errors(form)
            return self.json_error(errors, field_errors, status=400)
        case = services.create_case(request.user, kind, form.cleaned_data)
        return self.json_success(
            {'case': CaseSerializer.serialize_detail(request, case)},
            message='Borrador guardado. Adjunte los soportes para enviarlo a revisión.',
            status=201,
        )


class CaseDetailApiView(BaseApiView):
    """Consulta detallada de un expediente."""

    def get(self, request, case_id):
        case = get_case(request.user, case_id)
        self.current_case = case
        services.audit(case, request.user, 'Expediente consultado', before=case.stage, after=case.stage)
        return self.json_success(CaseSerializer.serialize_detail(request, case))


class CaseSaveApiView(BaseApiView):
    """Guardado de datos de la etapa activa del expediente."""

    def post(self, request, case_id):
        case = get_case(request.user, case_id)
        self.current_case = case
        step = editable_step(case)
        if not step:
            raise PermissionDenied('Esta etapa no admite edición de datos.')
        keys = BASE_FIELDS[case.kind] if step['key'] == 'borrador' else step['fields']
        body = self.parse_body(request)
        form = CaseDataForm(body, keys=keys)
        if not form.is_valid():
            errors, field_errors = self.format_form_errors(form)
            record_failure(request, ValidationError('Datos rechazados: ' + ', '.join(form.errors)), case)
            return self.json_error(errors, field_errors, status=400)
        updated = services.save_data(request.user, case.pk, form.cleaned_data['revision'], form.cleaned_data)
        return self.json_success(
            CaseSerializer.serialize_detail(request, updated),
            message='Datos guardados.',
        )


class CaseDecisionApiView(BaseApiView):
    """Ejecución de transiciones de estado (advance, return, reject, note)."""

    def post(self, request, case_id):
        case = get_case(request.user, case_id)
        self.current_case = case
        body = self.parse_body(request)
        form = DecisionForm(body)
        if not form.is_valid():
            errors, field_errors = self.format_form_errors(form)
            return self.json_error(errors, field_errors, status=400)
        d = form.cleaned_data
        updated = services.transition(request.user, case.pk, d['revision'], d['action'], d['note'])
        return self.json_success(
            CaseSerializer.serialize_detail(request, updated),
            message='Actuación registrada.',
        )


class CaseUploadApiView(BaseApiView):
    """Incorporación de documentos soporte al expediente."""

    def post(self, request, case_id):
        case = get_case(request.user, case_id)
        self.current_case = case
        form = UploadForm(request.POST, request.FILES, categories=services.upload_categories(request.user, case))
        if not form.is_valid():
            errors, field_errors = self.format_form_errors(form)
            record_failure(request, ValidationError('Documento rechazado: ' + ', '.join(form.errors)), case)
            return self.json_error(errors, field_errors, status=400)
        d = form.cleaned_data
        services.upload(request.user, case.pk, d['revision'], d['category'], d['file'])
        case.refresh_from_db()
        return self.json_success(
            CaseSerializer.serialize_detail(request, case),
            message='Documento incorporado al expediente.',
        )


class CasePaymentApiView(BaseApiView):
    """Registro de movimientos financieros (recuperación, desembolso, reintegro)."""

    def post(self, request, case_id):
        case = get_case(request.user, case_id)
        self.current_case = case
        body = self.parse_body(request)
        form = PaymentForm(body, case=case)
        if not form.is_valid():
            errors, field_errors = self.format_form_errors(form)
            record_failure(request, ValidationError('Movimiento rechazado: ' + ', '.join(form.errors)), case)
            return self.json_error(errors, field_errors, status=400)
        d = form.cleaned_data
        services.record_payment(request.user, case.pk, d['revision'], d)
        case.refresh_from_db()
        return self.json_success(
            CaseSerializer.serialize_detail(request, case),
            message='Movimiento financiero registrado.',
        )


class CaseRecognitionApiView(BaseApiView):
    """Registro de reconocimiento adicional en recobro de incapacidades."""

    def post(self, request, case_id):
        case = get_case(request.user, case_id)
        self.current_case = case
        body = self.parse_body(request)
        form = RecognitionForm(body, case=case)
        if not form.is_valid():
            errors, field_errors = self.format_form_errors(form)
            record_failure(request, ValidationError('Reconocimiento rechazado: valores o soporte no válidos.'), case)
            return self.json_error(errors, field_errors, status=400)
        d = form.cleaned_data
        updated = services.additional_recognition(
            request.user,
            case.pk,
            d['revision'],
            d['recognized'],
            d['note'],
            d['document_id'].pk,
        )
        return self.json_success(
            CaseSerializer.serialize_detail(request, updated),
            message='Reconocimiento actualizado.',
        )


class CaseVacationInterruptionApiView(BaseApiView):
    """Registro de suspensión o aplazamiento de vacaciones concedidas."""

    def post(self, request, case_id):
        case = get_case(request.user, case_id)
        self.current_case = case
        body = self.parse_body(request)
        form = VacationInterruptionForm(body, case=case)
        if not form.is_valid():
            errors, field_errors = self.format_form_errors(form)
            record_failure(request, ValidationError('Novedad de vacaciones rechazada: ' + ', '.join(form.errors)), case)
            return self.json_error(errors, field_errors, status=400)
        d = form.cleaned_data
        updated = services.interrupt_vacation(
            request.user,
            case.pk,
            d['revision'],
            d['kind'],
            d['on_date'],
            d['reason'],
            d['document_id'].pk,
        )
        return self.json_success(
            CaseSerializer.serialize_detail(request, updated),
            message='Novedad registrada. Los días no disfrutados quedaron devueltos al periodo.',
        )


class CompensatoryCalendarApiView(BaseApiView):
    """Consulta del calendario de compensatorios autorizados y saldos personales."""

    def get(self, request):
        visible = visible_cases(request.user).filter(kind='compensatorio')
        entries = list(
            CompensatoryLedgerEntry.objects.filter(kind='debito', case__in=visible)
            .select_related('employee', 'case', 'actor')
        )
        entries.sort(
            key=lambda entry: (
                entry.case.data.get('request_start_date', ''),
                entry.employee.get_full_name() or entry.employee.username,
            )
        )
        services.audit(None, request.user, 'Calendario de compensatorios consultado', count=len(entries))
        return self.json_success({
            'today': timezone.localdate().isoformat(),
            'own_balance': services.compensatory_balance(request.user),
            'entries': [
                {
                    'id': e.pk,
                    'request_start_date': e.case.data.get('request_start_date', ''),
                    'request_end_date': e.case.data.get('request_end_date', ''),
                    'employee': e.employee.get_full_name() or e.employee.username,
                    'minutes': e.minutes,
                    'department': e.case.department,
                    'case_id': str(e.case_id),
                    'case_reference': e.case.reference,
                    'actor': e.actor.get_full_name() or e.actor.username,
                    'created_at': e.created_at.isoformat(),
                }
                for e in entries
            ],
        })


class ProcedureApiView(BaseApiView):
    """Matriz técnica de procedimientos, etapas, campos y documentos."""

    def get(self, request):
        modules = []
        titles = {
            **KIND_TITLES,
            'compensatorio': 'Gestión de compensatorios · propuesta',
        }
        for kind, stages in WORKFLOWS.items():
            serialized_stages = []
            for idx, s in enumerate(stages, start=1):
                serialized_stages.append({
                    'number': idx,
                    'key': s['key'],
                    'label': s['label'],
                    'roles': [ROLE_LABELS.get(r, r) for r in s['roles']],
                    'fields': [FIELDS[k][0] for k in s['fields'] if k in FIELDS],
                    'docs': [DOCS[d] for d in s['docs'] if d in DOCS],
                })
            modules.append({
                'kind': kind,
                'title': titles[kind],
                'stages': serialized_stages,
            })
        return self.json_success({'modules': modules})


class ConfigurationApiView(BaseApiView):
    """Consulta y registro de versiones normativas y escalas de viáticos."""

    def check_view_permission(self, user):
        roles = role_names(user)
        if not roles & {'autoridad', 'administrador', 'talento', 'presupuesto', 'control'}:
            raise PermissionDenied('No tiene permisos para consultar parámetros normativos.')
        return 'autoridad' in roles

    def get(self, request):
        can_approve = self.check_view_permission(request.user)
        policies = [
            {
                'id': p.pk,
                'kind': p.kind,
                'kind_display': p.get_kind_display(),
                'version': p.version,
                'confirmed': p.confirmed,
                'source': p.source,
                'source_pages': p.source_pages,
                'approval_reference': p.approval_reference,
                'config': p.config,
                'created_by': (p.created_by.get_full_name() or p.created_by.username) if p.created_by else '',
                'created_at': p.created_at.isoformat(),
            }
            for p in PolicyVersion.objects.select_related('created_by')
        ]
        scales = [
            {
                'id': s.pk,
                'name': s.name,
                'category': s.category,
                'destination': s.destination,
                'valid_from': s.valid_from.isoformat(),
                'valid_until': s.valid_until.isoformat(),
                'overnight_rate': str(s.overnight_rate),
                'day_rate': str(s.day_rate),
                'source': s.source,
                'approval_reference': s.approval_reference,
                'approved_by': s.approved_by.get_full_name() or s.approved_by.username,
                'created_at': s.created_at.isoformat(),
            }
            for s in TravelScale.objects.select_related('approved_by')
        ]
        return self.json_success({
            'can_approve': can_approve,
            'kinds': [[k, label] for k, label in KINDS],
            'policies': policies,
            'scales': scales,
        })

    def post(self, request):
        require_role(request.user, 'autoridad')
        body = self.parse_body(request)
        form_type = body.get('form_type')
        if form_type == 'scale':
            form = ScaleForm(body)
            if not form.is_valid():
                errors, field_errors = self.format_form_errors(form)
                return self.json_error(errors, field_errors, status=400)
            with transaction.atomic():
                scale = form.save(commit=False)
                scale.approved_by = request.user
                scale.save()
                services.audit(
                    None,
                    request.user,
                    'Escala versionada registrada',
                    scale_id=scale.pk,
                    source=scale.source,
                    approval_reference=scale.approval_reference,
                )
            return self.json_success(message='Escala registrada. Sus valores permanecerán inmutables.', status=201)
        elif form_type == 'policy':
            if isinstance(body.get('config'), dict):
                body = {**body, 'config': json.dumps(body['config'])}
            form = PolicyForm(body)
            if not form.is_valid():
                errors, field_errors = self.format_form_errors(form)
                return self.json_error(errors, field_errors, status=400)
            with transaction.atomic():
                d = form.cleaned_data
                latest = PolicyVersion.objects.filter(kind=d['kind']).first()
                policy = PolicyVersion.objects.create(
                    **d,
                    version=latest.version + 1 if latest else 1,
                    created_by=request.user,
                )
                services.audit(
                    None,
                    request.user,
                    'Versión de procedimiento aprobada',
                    policy_id=policy.pk,
                    kind=policy.kind,
                    version=policy.version,
                    approval_reference=policy.approval_reference,
                )
            return self.json_success(message='Versión aprobada. Se aplicará a nuevos expedientes.', status=201)
        return self.json_error('Formulario desconocido.', status=400)


class UsersApiView(BaseApiView):
    """Administración del directorio de usuarios y creación de cuentas."""

    required_role = 'administrador'

    def get(self, request):
        users_list = []
        for u in User.objects.select_related('profile', 'profile__dependencia').prefetch_related('groups').order_by('username'):
            profile = getattr(u, 'profile', None)
            dependencia = getattr(profile, 'dependencia', None)
            users_list.append({
                'id': u.pk,
                'username': u.username,
                'full_name': u.get_full_name() or u.username,
                'department': profile.department if profile else '',
                'employment': profile.employment if profile else 'funcionario',
                'employment_display': profile.get_employment_display() if profile else 'Funcionario',
                'cedula': (profile.cedula or '') if profile else '',
                'cargo': profile.cargo if profile else '',
                'codigo': profile.codigo if profile else '',
                'grado': profile.grado if profile else '',
                'hire_date': profile.hire_date.isoformat() if (profile and profile.hire_date) else '',
                'is_jefe': bool(dependencia and dependencia.jefe_id == u.pk),
                'is_active': u.is_active,
                'roles': [g.name for g in u.groups.all()],
            })
        return self.json_success({
            'users': users_list,
            'available_roles': [[k, label] for k, label in ROLES],
            'employments': [['funcionario', 'Funcionario'], ['contratista', 'Contratista']],
        })

    def post(self, request):
        body = self.parse_body(request)
        form = UserForm(body)
        if not form.is_valid():
            errors, field_errors = self.format_form_errors(form)
            return self.json_error(errors, field_errors, status=400)
        with transaction.atomic():
            d = form.cleaned_data
            user = User.objects.create_user(d['username'], password=d['password'], first_name=d['name'])
            services.apply_profile(Profile.objects.create(user=user), d)
            user.groups.set([Group.objects.get_or_create(name=r)[0] for r in d['roles']])
            services.audit(None, request.user, 'Usuario creado', target_user=user.pk, roles=d['roles'])
        return self.json_success(message='Usuario creado.', status=201)


class UserAccessApiView(BaseApiView):
    """Actualización de roles, estado activo, datos laborales y contraseña de un usuario."""

    required_role = 'administrador'

    def post(self, request, user_id):
        target_user = get_object_or_404(User, pk=user_id)
        body = self.parse_body(request)
        form = UserAccessForm(body, user=target_user)
        if not form.is_valid():
            errors, field_errors = self.format_form_errors(form)
            return self.json_error(errors, field_errors, status=400)
        d = form.cleaned_data
        with transaction.atomic():
            if (
                (not d['active'] or 'administrador' not in d['roles'])
                and 'administrador' in role_names(target_user)
                and not User.objects.filter(is_active=True, groups__name='administrador').exclude(pk=target_user.pk).exists()
            ):
                return self.json_error('Debe conservar al menos un administrador activo.', status=400)
            target_user.is_active = d['active']
            if d['password']:
                target_user.set_password(d['password'])
            target_user.save()
            profile, _ = Profile.objects.get_or_create(user=target_user)
            if d.get('department'):
                services.apply_profile(profile, d)
            target_user.groups.set([Group.objects.get_or_create(name=r)[0] for r in d['roles']])
            services.audit(
                None,
                request.user,
                'Permisos de usuario actualizados',
                target_user=target_user.pk,
                roles=d['roles'],
                active=d['active'],
                password_reset=bool(d['password']),
            )
        return self.json_success(message='Acceso actualizado.')


class AuditApiView(BaseApiView):
    """Consulta paginada de la bitácora de auditoría del sistema."""

    required_role = 'administrador'

    def get(self, request):
        events_qs = Event.objects.select_related('actor', 'case').order_by('-created_at', '-id')
        page_obj = Paginator(events_qs, 50).get_page(request.GET.get('page'))
        return self.json_success({
            'page': page_obj.number,
            'num_pages': page_obj.paginator.num_pages,
            'has_previous': page_obj.has_previous(),
            'has_next': page_obj.has_next(),
            'events': [
                {
                    'id': e.pk,
                    'created_at': e.created_at.isoformat(),
                    'actor': (e.actor.get_full_name() or e.actor.username) if e.actor else 'Sin autenticar',
                    'action': e.action,
                    'case_id': str(e.case_id) if e.case_id else None,
                    'case_reference': e.case.reference if e.case else 'Sistema',
                    'result': e.details.get('result', 'validado') if isinstance(e.details, dict) else 'validado',
                }
                for e in page_obj.object_list
            ],
        })
