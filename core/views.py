import csv
import hashlib
import json
from datetime import timedelta, date
from decimal import Decimal, InvalidOperation
from io import BytesIO
from django.conf import settings
from django.contrib import messages
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import AuthenticationForm, PasswordChangeForm
from django.contrib.auth.models import Group, User
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.paginator import Paginator
from django.db import transaction
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import render, redirect, get_object_or_404
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_POST, require_http_methods
from .models import Case, CompensatoryLedgerEntry, Document, EmployeeDocument, Event, Profile, PolicyVersion, TravelScale, LoginAttempt, ROLES
from .forms import RecognitionForm, CaseDataForm, UploadForm, PaymentForm, DecisionForm, SetupForm, UserForm, UserAccessForm, ScaleForm, PolicyForm, VacationInterruptionForm, BASE_FIELDS
from .workflows import workflow, current_step, editable_step, stage_label, actor_for, actor_for_transition, role_names, WORKFLOWS, DOCS, FIELDS, RELATIONAL_ROLES
from .access import visible_cases, get_case, can_document, require_role
from . import services, vacations

ROLE_LABELS = {**dict(ROLES), **RELATIONAL_ROLES}
KIND_TITLES = {'incapacidad': 'Incapacidades y recobro', 'viatico': 'Viáticos y gastos de viaje', 'compensatorio': 'Gestión de compensatorios', 'vacaciones': 'Vacaciones'}


def record_failure(request, exc, case=None):
    services.audit(case, request.user if request.user.is_authenticated else None, 'Validación rechazada', note=' · '.join(exc.messages) if isinstance(exc, ValidationError) else 'Acción no autorizada', result='rechazado')


def perform(request, function, case=None, success='Actuación registrada.'):
    try:
        function()
        messages.success(request, success)
        return True
    except ValidationError as exc:
        record_failure(request, exc, case)
        for error in exc.messages:
            messages.error(request, error)
    except PermissionDenied as exc:
        record_failure(request, exc, case)
        raise
    return False


@require_http_methods(['GET', 'POST'])
def setup(request):
    if User.objects.exists():
        return redirect('login')
    if settings.PRODUCTION or request.META.get('REMOTE_ADDR') not in {'127.0.0.1', '::1'}:
        raise PermissionDenied('La configuración inicial web solo está disponible localmente.')
    form = SetupForm(request.POST or None)
    if request.method == 'POST' and form.is_valid():
        with transaction.atomic():
            if User.objects.exists():
                return redirect('login')
            data = form.cleaned_data
            user = User.objects.create_user(data['username'], password=data['password'], first_name=data['name'])
            services.apply_profile(Profile(user=user), data)
            user.groups.add(Group.objects.get_or_create(name='administrador')[0])
            services.audit(None, user, 'Administrador inicial creado')
        login(request, user)
        messages.success(request, 'Administrador creado. Registre los usuarios y asigne sus roles.')
        return redirect('dashboard')
    return render(request, 'core/auth.html', {'form': form, 'setup': True, 'title': 'Configure su espacio institucional'})


@require_http_methods(['GET', 'POST'])
def sign_in(request):
    if not User.objects.exists():
        return redirect('setup')
    if request.user.is_authenticated:
        return redirect('dashboard')
    form = AuthenticationForm(request, data=request.POST or None)
    if request.method == 'POST':
        username = request.POST.get('username', '')[:150]
        key = hashlib.sha256((request.META.get('REMOTE_ADDR', '') + '|' + username.casefold()).encode()).hexdigest()
        now = timezone.now()
        attempt = LoginAttempt.objects.filter(key=key).first()
        if attempt and attempt.failures >= 5 and attempt.last_attempt > now - timedelta(minutes=15):
            messages.error(request, 'Demasiados intentos. Intente nuevamente en 15 minutos.')
            return render(request, 'core/auth.html', {'form': AuthenticationForm(), 'title': 'Bienvenido de nuevo'}, status=429)
        if form.is_valid():
            login(request, form.get_user())
            LoginAttempt.objects.filter(key=key).delete()
            services.audit(None, request.user, 'Inicio de sesión')
            return redirect('dashboard')
        with transaction.atomic():
            attempt, _ = LoginAttempt.objects.get_or_create(key=key, defaults={'last_attempt': now})
            if attempt.last_attempt < now - timedelta(minutes=15):
                attempt.failures = 0
            attempt.failures += 1
            attempt.last_attempt = now
            attempt.save()
        services.audit(None, None, 'Inicio de sesión rechazado', result='rechazado', attempt_key=key)
    return render(request, 'core/auth.html', {'form': form, 'title': 'Bienvenido de nuevo'})


@require_POST
@login_required
def sign_out(request):
    services.audit(None, request.user, 'Cierre de sesión')
    logout(request)
    return redirect('login')


@login_required
@require_http_methods(['GET', 'POST'])
def password_change(request):
    form = PasswordChangeForm(request.user, request.POST or None)
    if request.method == 'POST' and form.is_valid():
        user = form.save()
        update_session_auth_hash(request, user)
        services.audit(None, user, 'Contraseña actualizada')
        messages.success(request, 'Contraseña actualizada.')
        return redirect('dashboard')
    return render(request, 'core/form.html', {'form': form, 'title': 'Cambiar contraseña', 'button': 'Actualizar contraseña'})


def decorate(case):
    from .workflows import completed_stage_keys
    case.stage_label = stage_label(case)
    steps = workflow(case)
    case.step = editable_step(case)
    case.progress = round(len(completed_stage_keys(case)) / len(steps) * 100) if steps else 0
    case.overdue = bool(case.due_at and case.due_at < timezone.now() and case.stage not in services.TERMINAL)
    return case


@login_required
def dashboard(request):
    cases = list(filtered_cases(request, None).prefetch_related('financial_entries'))
    now = timezone.now()
    stats = {'total': len(cases), 'active': 0, 'closed': 0, 'review': 0, 'overdue': 0, 'rejected': 0, 'recovered': Decimal('0'), 'pending': Decimal('0'), 'committed': Decimal('0'), 'executed': Decimal('0'), 'payments': Decimal('0'), 'legalizations': 0, 'approved_trips': 0, 'inc_review': 0, 'inc_recoveries': 0, 'trip_rejected': 0, 'trip_commissions': 0, 'trip_paid': 0}
    tasks, alerts = [], []
    kinds = {
        'incapacidad': {'name': 'Incapacidades', 'count': 0, 'closed': 0},
        'viatico': {'name': 'Viáticos', 'count': 0, 'closed': 0},
        'compensatorio': {'name': 'Compensatorios', 'count': 0, 'closed': 0},
        'vacaciones': {'name': 'Vacaciones', 'count': 0, 'closed': 0},
    }
    stats.update({'comp_pending': 0, 'comp_authorized': 0, 'comp_balance': 0})
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
            alerts.append({'case': case, 'label': 'Plazo de etapa vencido', 'date': case.due_at})
        if case.stage == 'correccion':
            alerts.append({'case': case, 'label': 'Documentación por corregir', 'date': case.updated_at})
        if actor_for(request.user, case) or actor_for_transition(request.user, case):
            tasks.append(case)
            step = editable_step(case)
            existing = set(case.documents.values_list('category', flat=True))
            missing = [DOCS[k] for k in step['docs'] if k not in existing]
            if missing:
                alerts.append({'case': case, 'label': 'Faltan documentos: ' + ', '.join(missing), 'date': case.updated_at})
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
                        alerts.append({'case': case, 'label': milestone['label'], 'date': when})
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
    # Los recordatorios de vacaciones van primero: son los que dependen de una fecha próxima.
    alerts = vacations.alerts(request.user, cases) + alerts
    provisional = PolicyVersion.objects.filter(confirmed=False).exists() or not PolicyVersion.objects.exists()
    return render(request, 'core/dashboard.html', {'title': 'Panel de gestión', 'stats': stats, 'tasks': tasks[:8], 'recent': cases[:6], 'alerts': alerts[:8], 'kinds': kinds, 'provisional': provisional, 'task_count': len(tasks), 'today': timezone.localdate()})


def filtered_cases(request, kind):
    cases = visible_cases(request.user)
    if kind:
        cases = cases.filter(kind=kind)
    from django.db.models import Q
    query = request.GET.get('q', '').strip()[:200]
    if query:
        cases = cases.filter(Q(owner__first_name__icontains=query) | Q(owner__username__icontains=query) | Q(department__icontains=query) | Q(data__destination__icontains=query))
    state = request.GET.get('state')
    if state:
        cases = cases.filter(stage=state)
    department = request.GET.get('department', '').strip()[:160]
    if department:
        cases = cases.filter(department__icontains=department)
    for key, lookup in [('from', 'created_at__date__gte'), ('until', 'created_at__date__lte')]:
        value = request.GET.get(key)
        if value:
            try:
                cases = cases.filter(**{lookup: date.fromisoformat(value)})
            except ValueError:
                messages.error(request, 'El filtro de fecha no es válido.')
    return cases


@login_required
def case_list(request, kind):
    if kind not in WORKFLOWS:
        raise Http404
    queryset = filtered_cases(request, kind)
    page = Paginator(queryset, 15).get_page(request.GET.get('page'))
    cases = [decorate(c) for c in page.object_list]
    states = [(s['key'], s['label']) for s in WORKFLOWS[kind]] + [('correccion', 'En corrección'), ('cerrado', 'Cerrado'), ('rechazado', 'Rechazado')]
    query = request.GET.copy()
    query.pop('page', None)
    return render(request, 'core/list.html', {'title': KIND_TITLES[kind], 'kind': kind, 'cases': cases, 'page': page, 'states': states, 'query': query.urlencode(), 'count': queryset.count()})


@login_required
@require_http_methods(['GET', 'POST'])
def case_create(request, kind):
    if kind not in WORKFLOWS:
        raise Http404
    form = CaseDataForm(request.POST or None, keys=BASE_FIELDS[kind], initial={'revision': 1})
    if request.method == 'POST' and form.is_valid():
        result = []
        if perform(request, lambda: result.append(services.create_case(request.user, kind, form.cleaned_data)), success='Borrador guardado. Adjunte los soportes para enviarlo a revisión.'):
            return redirect('case_detail', case_id=result[0].pk)
    titles = {'incapacidad': 'Nueva incapacidad', 'viatico': 'Nueva comisión', 'compensatorio': 'Nuevo registro de tiempo trabajado', 'vacaciones': 'Nueva solicitud de vacaciones'}
    return render(request, 'core/form.html', {'form': form, 'title': titles[kind], 'subtitle': 'Guarde el borrador, complete sus documentos y envíelo a revisión.', 'button': 'Guardar borrador', 'back': reverse('case_list', args=[kind])})


def detail_context(request, case, **extra):
    from .workflows import completed_stage_keys, state_display
    decorate(case)
    step = editable_step(case)
    if step:
        step['role_labels'] = [ROLE_LABELS.get(r, r) for r in step['roles']]
    can_edit = actor_for(request.user, case) or actor_for_transition(request.user, case)
    keys = BASE_FIELDS[case.kind] if step and step['key'] == 'borrador' else step['fields'] if step else []
    documents = [d for d in case.documents.defer('content').select_related('uploaded_by') if can_document(request.user, d)]
    for d in documents:
        d.label = DOCS.get(d.category, d.category)
    categories = services.upload_categories(request.user, case)
    initial = {'revision': case.revision}
    steps = workflow(case)
    index = next((i for i, s in enumerate(steps) if step and s['key'] == step['key']), len(steps))
    completed = completed_stage_keys(case)
    for i, s in enumerate(steps):
        s['done'] = s['key'] in completed
        s['current'] = i == index and case.stage not in services.TERMINAL
        s['role_labels'] = [ROLE_LABELS.get(r, r) for r in s['roles']]
    roles = role_names(request.user)
    full = case.owner_id == request.user.pk or ('talento' in roles if case.kind == 'incapacidad' else bool(roles & {'talento', 'juridica', 'secretaria', 'autoridad', 'control'}))
    financial_keys = {'start_date', 'end_date', 'days', 'incapacity_number', 'radication_number', 'epicrisis_radication', 'resolution_number', 'resolution_radication', 'resolution_date', 'payer_entity', 'requested', 'recognized', 'employee_paid', 'employee_paid_on', 'employee_payment_ref', 'finance_notice', 'accounting_reference', 'reconciliation_note', 'balance_note', 'closure_note'}
    values = []
    for k, v in case.data.items():
        if k not in FIELDS or (not full and case.kind == 'incapacidad' and k not in financial_keys) or v == '' or v is None:
            continue
        definition = FIELDS[k]
        if definition[1] == 'choice':
            v = dict(definition[2]).get(v, v)
        if type(v) is bool:
            v = 'Sí' if v else 'No'
        values.append({'label': definition[0], 'value': v})
    events = case.events.select_related('actor').order_by('-created_at', '-id')
    if request.GET.get('history') != 'all':
        events = events.exclude(action__in=['Expediente consultado', 'Documento visualizado', 'Documento descargado', 'Acceso documental rechazado', 'Operación rechazada'])
    event_page = Paginator(events, 30).get_page(request.GET.get('history_page'))
    for event in event_page.object_list:
        event.before_label = state_display(case, event.before)
        event.after_label = state_display(case, event.after)
    extra.setdefault('vacation', vacation_context(request, case, initial) if case.kind == 'vacaciones' else None)
    return {'case': case, 'title': case.reference, 'step': step, 'steps': steps, 'can_edit': can_edit, 'can_return': can_edit and case.stage not in {'borrador', 'correccion'} and step and 'owner' not in step['roles'], 'full_access': full, 'data_form': CaseDataForm(keys=keys, initial_data=case.data, initial=initial), 'upload_form': UploadForm(categories=categories, initial=initial) if categories else None, 'decision_form': DecisionForm(initial=initial), 'payment_form': PaymentForm(case=case, initial=initial) if services.treasury_allowed(request.user, case) else None, 'documents': documents, 'events': event_page, 'values': values, 'totals': services.totals(case), 'compensatory': services.compensatory_summary(case) if case.kind == 'compensatorio' else None, 'ledger_entries': case.owner.compensatory_ledger.select_related('case', 'actor') if case.kind == 'compensatorio' else [], 'can_recognize': case.kind == 'incapacidad' and 'talento' in roles and case.stage in {'transcripcion', 'comprobante'}, 'recognition_documents': case.documents.filter(category='reconocimiento').defer('content'), 'required_documents': [DOCS[d] for d in step['docs']] if step else [], **extra}


@login_required
def case_detail(request, case_id):
    case = get_case(request.user, case_id)
    services.audit(case, request.user, 'Expediente consultado', before=case.stage, after=case.stage)
    return render(request, 'core/detail.html', detail_context(request, case))


@login_required
@require_POST
def case_save(request, case_id):
    case = get_case(request.user, case_id)
    step = editable_step(case)
    if not step:
        raise PermissionDenied
    keys = BASE_FIELDS[case.kind] if step['key'] == 'borrador' else step['fields']
    form = CaseDataForm(request.POST, keys=keys)
    if form.is_valid():
        perform(request, lambda: services.save_data(request.user, case.pk, form.cleaned_data['revision'], form.cleaned_data), case, 'Datos guardados.')
    else:
        record_failure(request, ValidationError('Datos rechazados: ' + ', '.join(form.errors)), case)
        return render(request, 'core/detail.html', detail_context(request, case, data_form=form), status=400)
    return redirect('case_detail', case_id=case.pk)


@login_required
@require_POST
def case_decision(request, case_id):
    case = get_case(request.user, case_id)
    form = DecisionForm(request.POST)
    if form.is_valid():
        d = form.cleaned_data
        perform(request, lambda: services.transition(request.user, case.pk, d['revision'], d['action'], d['note']), case)
    else:
        return render(request, 'core/detail.html', detail_context(request, case, decision_form=form), status=400)
    return redirect('case_detail', case_id=case.pk)


@login_required
@require_POST
def case_upload(request, case_id):
    case = get_case(request.user, case_id)
    form = UploadForm(request.POST, request.FILES, categories=services.upload_categories(request.user, case))
    if form.is_valid():
        d = form.cleaned_data
        perform(request, lambda: services.upload(request.user, case.pk, d['revision'], d['category'], d['file']), case, 'Documento incorporado al expediente.')
    else:
        record_failure(request, ValidationError('Documento rechazado: ' + ', '.join(form.errors)), case)
        return render(request, 'core/detail.html', detail_context(request, case, upload_form=form), status=400)
    return redirect('case_detail', case_id=case.pk)


@login_required
def document_download(request, document_id, preview=False):
    document = get_object_or_404(Document.objects.select_related('case'), pk=document_id)
    case = get_case(request.user, document.case_id)
    if not can_document(request.user, document):
        services.audit(case, request.user, 'Acceso documental rechazado', document_id=document.pk, result='rechazado')
        raise PermissionDenied('Este documento está restringido a su responsable y Talento Humano.')
    services.audit(case, request.user, 'Documento visualizado' if preview else 'Documento descargado', document_id=document.pk, sha256=document.sha256)
    response = FileResponse(BytesIO(bytes(document.content)), as_attachment=not preview, filename=document.name, content_type=document.content_type)
    if preview:
        response['Content-Security-Policy'] = (
            "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'self'"
        )
        response['X-Frame-Options'] = 'SAMEORIGIN'
    return response


@login_required
def employee_document_download(request, document_id, preview=False):
    document = get_object_or_404(EmployeeDocument.objects.select_related('employee'), pk=document_id)
    from .access import require_personnel_manager
    if request.user.pk != document.employee_id:
        require_personnel_manager(request.user)
    services.audit(
        None,
        request.user,
        'Documento de hoja de vida visualizado' if preview else 'Documento de hoja de vida descargado',
        employee_id=document.employee_id,
        document_id=document.pk,
        sha256=document.sha256,
    )
    response = FileResponse(
        BytesIO(bytes(document.content)),
        as_attachment=not preview,
        filename=document.name,
        content_type=document.content_type,
    )
    if preview:
        response['Content-Security-Policy'] = (
            "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'self'"
        )
        response['X-Frame-Options'] = 'SAMEORIGIN'
    return response


@login_required
@require_POST
def case_payment(request, case_id):
    case = get_case(request.user, case_id)
    form = PaymentForm(request.POST, case=case)
    if form.is_valid():
        d = form.cleaned_data
        perform(request, lambda: services.record_payment(request.user, case.pk, d['revision'], d), case, 'Movimiento financiero registrado.')
    else:
        record_failure(request, ValidationError('Movimiento rechazado: ' + ', '.join(form.errors)), case)
        return render(request, 'core/detail.html', detail_context(request, case, payment_form=form), status=400)
    return redirect('case_detail', case_id=case.pk)


@login_required
@require_POST
def case_recognition(request, case_id):
    case = get_case(request.user, case_id)
    form = RecognitionForm(request.POST, case=case)
    if form.is_valid():
        d = form.cleaned_data
        perform(request, lambda: services.additional_recognition(request.user, case.pk, d['revision'], d['recognized'], d['note'], d['document_id'].pk), case)
    else:
        record_failure(request, ValidationError('Reconocimiento rechazado: valores o soporte no válidos.'), case)
        for key, errors in form.errors.items():
            for error in errors:
                messages.error(request, error)
    return redirect('case_detail', case_id=case.pk)


def vacation_context(request, case, initial):
    try:
        periods = vacations.period_summary(case.owner)
    except ValidationError as exc:
        periods, problem = [], ' '.join(exc.messages)
    else:
        problem = ''
    can_interrupt = services.can_interrupt_vacation(request.user, case)
    return {
        'periods': periods,
        'problem': problem,
        'entries': case.vacation_entries.select_related('period', 'actor'),
        'interruption_form': VacationInterruptionForm(case=case, initial=initial) if can_interrupt else None,
    }


@login_required
@require_POST
def case_vacation_interruption(request, case_id):
    case = get_case(request.user, case_id)
    form = VacationInterruptionForm(request.POST, case=case)
    if form.is_valid():
        d = form.cleaned_data
        perform(request, lambda: services.interrupt_vacation(request.user, case.pk, d['revision'], d['kind'], d['on_date'], d['reason'], d['document_id'].pk), case, 'Novedad de vacaciones registrada.')
    else:
        record_failure(request, ValidationError('Novedad rechazada: ' + ', '.join(form.errors)), case)
        for errors in form.errors.values():
            for error in errors:
                messages.error(request, error)
    return redirect('case_detail', case_id=case.pk)


def safe_csv(value):
    value = str(value)
    return "'" + value if value.lstrip().startswith(('=', '+', '-', '@', '\t', '\r')) else value


@login_required
def report(request, kind):
    if kind not in WORKFLOWS:
        raise Http404
    response = HttpResponse(content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="reporte-{kind}-{timezone.localdate()}.csv"'
    response.write('\ufeff')
    writer = csv.writer(response, delimiter=';')
    financial = {'incapacidad': ['Solicitado', 'Reconocido', 'Recuperado', 'Saldo pendiente', 'Diferencia reconocimiento'], 'viatico': ['Comprometido', 'Autorizado', 'Desembolsado', 'Ejecutado', 'Reintegrado', 'Diferencia'], 'compensatorio': ['Minutos trabajados', 'Minutos reconocidos', 'Minutos solicitados', 'Saldo del funcionario'], 'vacaciones': ['Periodo de causación', 'Días hábiles', 'Días calendario', 'Reintegro previsto', 'Novedad']}[kind]
    writer.writerow(['Expediente', 'Solicitante', 'Dependencia', 'Estado', 'Creación', 'Inicio', 'Fin', *financial])
    count = 0
    for case in filtered_cases(request, kind).iterator(chunk_size=100):
        if kind == 'vacaciones':
            amounts = [case.data.get(k, '') for k in ['period_label', 'business_days', 'days', 'return_date', 'interruption_kind']]
            start, end = case.data.get('start_date', ''), case.data.get('end_date', '')
        elif kind == 'compensatorio':
            t = services.compensatory_summary(case)
            amounts = [t[k] for k in ['worked', 'approved', 'requested', 'balance']]
            start, end = case.data.get('request_start_date', ''), case.data.get('request_end_date', '')
        else:
            t = services.totals(case)
            amounts = [t[k] for k in (['requested', 'recognized', 'recovered', 'pending', 'difference'] if kind == 'incapacidad' else ['committed', 'authorized', 'paid', 'executed', 'returned', 'travel_balance'])]
            start, end = case.data.get('start_date', ''), case.data.get('end_date', '')
        writer.writerow([safe_csv(x) for x in [case.reference, case.owner.get_full_name() or case.owner.username, case.department, stage_label(case), case.created_at.isoformat(), start, end, *amounts]])
        count += 1
    services.audit(None, request.user, 'Reporte exportado', kind=kind, count=count)
    return response


@login_required
@require_http_methods(['GET', 'POST'])
def users(request):
    require_role(request.user, 'administrador')
    form = UserForm(request.POST or None)
    if request.method == 'POST' and form.is_valid():
        with transaction.atomic():
            d = form.cleaned_data
            user = User.objects.create_user(d['username'], password=d['password'], first_name=d['name'])
            services.apply_profile(Profile(user=user), d)
            user.groups.set([Group.objects.get_or_create(name=r)[0] for r in d['roles']])
            services.audit(None, request.user, 'Usuario creado', target_user=user.pk, roles=d['roles'])
        messages.success(request, 'Usuario creado.')
        return redirect('users')
    return render(request, 'core/users.html', {'title': 'Usuarios y permisos', 'form': form, 'users': User.objects.select_related('profile').prefetch_related('groups').order_by('username')})


@login_required
@require_http_methods(['GET', 'POST'])
def user_access(request, user_id):
    require_role(request.user, 'administrador')
    user = get_object_or_404(User, pk=user_id)
    profile = Profile.objects.filter(user=user).select_related('dependencia').first() or Profile(user=user, department='')
    initial = {'roles': list(role_names(user)), 'active': user.is_active, 'department': profile.department, 'employment': profile.employment, 'cedula': profile.cedula, 'cargo': profile.cargo, 'codigo': profile.codigo, 'grado': profile.grado, 'hire_date': profile.hire_date, 'is_jefe': bool(profile.dependencia_id and profile.dependencia.jefe_id == user.pk)}
    form = UserAccessForm(request.POST or None, initial=initial, user=user)
    if request.method == 'POST' and form.is_valid():
        d = form.cleaned_data
        with transaction.atomic():
            if (not d['active'] or 'administrador' not in d['roles']) and 'administrador' in role_names(user) and not User.objects.filter(is_active=True, groups__name='administrador').exclude(pk=user.pk).exists():
                form.add_error(None, 'Debe conservar al menos un administrador activo.')
            else:
                user.is_active = d['active']
                if d['password']:
                    user.set_password(d['password'])
                user.save()
                d['department'] = d['department'] or profile.department
                d['employment'] = d['employment'] or profile.employment
                services.apply_profile(profile, d)
                user.groups.set([Group.objects.get_or_create(name=r)[0] for r in d['roles']])
                services.audit(None, request.user, 'Permisos de usuario actualizados', target_user=user.pk, roles=d['roles'], active=d['active'], password_reset=bool(d['password']))
                messages.success(request, 'Acceso actualizado.')
                return redirect('users')
    return render(request, 'core/form.html', {'title': 'Acceso · ' + user.username, 'form': form, 'button': 'Guardar permisos', 'back': reverse('users')})


@login_required
@require_http_methods(['GET', 'POST'])
def configuration(request):
    roles = role_names(request.user)
    if not roles & {'autoridad', 'administrador', 'talento', 'presupuesto', 'control'}:
        raise PermissionDenied
    scale_form, policy_form = ScaleForm(), PolicyForm()
    if request.method == 'POST':
        require_role(request.user, 'autoridad')
        if request.POST.get('form_type') == 'scale':
            scale_form = ScaleForm(request.POST)
            if scale_form.is_valid():
                with transaction.atomic():
                    scale = scale_form.save(commit=False)
                    scale.approved_by = request.user
                    scale.save()
                    services.audit(None, request.user, 'Escala versionada registrada', scale_id=scale.pk, source=scale.source, approval_reference=scale.approval_reference)
                messages.success(request, 'Escala registrada. Sus valores permanecerán inmutables.')
                return redirect('configuration')
        elif request.POST.get('form_type') == 'policy':
            policy_form = PolicyForm(request.POST)
            if policy_form.is_valid():
                with transaction.atomic():
                    d = policy_form.cleaned_data
                    latest = PolicyVersion.objects.filter(kind=d['kind']).first()
                    policy = PolicyVersion.objects.create(**d, version=latest.version + 1 if latest else 1, created_by=request.user)
                    services.audit(None, request.user, 'Versión de procedimiento aprobada', policy_id=policy.pk, kind=policy.kind, version=policy.version, approval_reference=policy.approval_reference)
                messages.success(request, 'Versión aprobada. Se aplicará a nuevos expedientes.')
                return redirect('configuration')
        else:
            messages.error(request, 'Formulario desconocido.')
    return render(request, 'core/configuration.html', {'title': 'Parámetros y normativa', 'scale_form': scale_form, 'policy_form': policy_form, 'can_approve': 'autoridad' in roles, 'scales': TravelScale.objects.select_related('approved_by'), 'policies': PolicyVersion.objects.select_related('created_by'), 'definitions': WORKFLOWS})


@login_required
def audit_log(request):
    require_role(request.user, 'administrador')
    events = Event.objects.select_related('actor', 'case').order_by('-created_at', '-id')
    return render(request, 'core/audit.html', {'title': 'Registro de auditoría', 'events': Paginator(events, 50).get_page(request.GET.get('page'))})


@login_required
def procedure(request):
    return render(request, 'core/procedure.html', {'title': 'Procedimientos y responsabilidades', 'definitions': WORKFLOWS, 'fields': FIELDS, 'docs': DOCS, 'roles': ROLE_LABELS})


@login_required
def compensatory_calendar(request):
    visible = visible_cases(request.user).filter(kind='compensatorio')
    entries = list(CompensatoryLedgerEntry.objects.filter(kind='debito', case__in=visible).select_related('employee', 'case', 'actor'))
    entries.sort(key=lambda entry: (entry.case.data.get('request_start_date', ''), entry.employee.get_full_name() or entry.employee.username))
    services.audit(None, request.user, 'Calendario de compensatorios consultado', count=len(entries))
    return render(request, 'core/compensatory_calendar.html', {
        'title': 'Calendario de compensatorios',
        'entries': entries,
        'today': timezone.localdate(),
        'own_balance': services.compensatory_balance(request.user),
        'kind': 'compensatorio',
    })


def forbidden(request, exception=None):
    return render(request, 'core/error.html', {'title': 'Acceso restringido', 'explanation': 'Su usuario no tiene permisos para realizar esta acción.'}, status=403)


def not_found(request, exception=None):
    return render(request, 'core/error.html', {'title': 'No encontramos este recurso', 'explanation': 'Compruebe la dirección y los permisos de su usuario.'}, status=404)
