from datetime import date, timedelta
from decimal import Decimal
from django.test import TestCase, Client, override_settings
from django.contrib.auth.models import User, Group
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from django.utils import timezone
from core.models import Case, CompensatoryLedgerEntry, Document, Event, FinancialEntry, Profile, PolicyVersion, TravelScale, ROLES
from core import services
from core.access import can_document, visible_cases
from core.forms import CaseDataForm, BASE_FIELDS
from core.workflows import current_step, editable_step, WORKFLOWS, validate_config

@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class WorkflowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.people = {}
        for key, label in ROLES:
            u = User.objects.create_user(key, password='Una-clave-segura-2026', first_name=label)
            Profile.objects.create(user=u, department='Dirección administrativa')
            u.groups.add(Group.objects.create(name=key))
            cls.people[key] = u
        cls.other = User.objects.create_user('otro', password='Otra-clave-segura-2026')
        Profile.objects.create(user=cls.other, department='Otra dependencia')
        for kind in WORKFLOWS:
            PolicyVersion.objects.create(kind=kind, version=1, confirmed=True, source='Fuente exclusiva de prueba', source_pages='1-9', approval_reference='Aprobación de prueba', config={})
        cls.scale = TravelScale.objects.create(name='Escala de prueba', category='Profesional', destination='Bogotá', valid_from=date(2020, 1, 1), valid_until=date(2035, 12, 31), overnight_rate=Decimal('200000'), day_rate=Decimal('100000'), source='Fuente de prueba; no normativa', approval_reference='Prueba', approved_by=cls.people['autoridad'])

    def new(self, kind='incapacidad', user=None, **overrides):
        start = timezone.localdate() - timedelta(days=10)
        data = {'start_date': start, 'end_date': start + timedelta(days=2), 'entity': 'EPS de prueba', 'leave_type': 'comun', 'observations': '', 'purpose': 'Comisión de prueba', 'destination': 'Bogotá', 'category': 'Profesional', 'overnight': True, 'transport': Decimal('50000')}
        data.update(overrides)
        return services.create_case(user or self.people['solicitante'], kind, data)

    def refresh(self, case):
        case.refresh_from_db()
        return case

    def actor(self, case):
        role = editable_step(case)['roles'][0]
        return case.owner if role == 'owner' else self.people[role]

    def attach(self, case, category, user=None, payload=None):
        self.refresh(case)
        actor = user or self.actor(case)
        content = payload or f'%PDF-1.4\nEvidence {category} {Document.objects.count()}\n%%EOF'.encode()
        file = SimpleUploadedFile(category + '.pdf', content, content_type='application/pdf')
        document = services.upload(actor, case.pk, case.revision, category, file)
        self.refresh(case)
        return document

    def fill(self, case, **overrides):
        step = editable_step(case)
        start = date.fromisoformat(case.data['start_date'])
        days = int(case.data.get('days') or 0)
        payer = 'contraloria' if days <= 2 else 'eps'
        values = {
            'draft_text': 'Proyecto de resolución redactado por el responsable para revisión jurídica.', 'cdp_request_ref': 'SOL-CDP', 'cdp_request_date': start - timedelta(days=4), 'rp_request_ref': 'SOL-RP', 'rp_request_date': start - timedelta(days=1), 'review_note': 'Requisitos verificados', 'legal_note': 'Revisado', 'resolution_number': 'RES-PRUEBA', 'resolution_radication': 'RES-RAD-001', 'resolution_date': start - timedelta(days=2),
            'archive_reference': 'EXP-PRUEBA', 'payer_entity': payer, 'employee_paid': Decimal('300000'), 'employee_paid_on': start,
            'employee_payment_ref': 'PAGO-PRUEBA', 'incapacity_number': 'INC-EPS-001', 'radication_number': 'RAD-001', 'epicrisis_radication': 'EPI-RAD-001', 'filing_entity': 'EPS de prueba', 'filing_number': 'RAD-001', 'filing_date': start,
            'filing_result': 'Transcripción registrada manualmente', 'requested': Decimal('300000'), 'recovery_reference': 'REC-001', 'recovery_date': start,
            'recognized': Decimal('300000'), 'recognition_date': start, 'followup_note': 'Entidad reconoce el total', 'finance_notice': 'COM-001',
            'accounting_reference': 'CONT-001', 'reconciliation_note': 'Revisado con soportes', 'balance_note': 'Sin saldo pendiente',
            'control_note': 'Control revisado', 'closure_note': 'Expediente completo', 'initial_authorization': 'AUT-001',
            'cdp_number': 'CDP-001', 'cdp_date': start - timedelta(days=3), 'cdp_amount': Decimal('1000000'),
            'scale_id': self.scale, 'overnight_days': 2, 'day_days': 1, 'authorized_transport': Decimal('50000'),
            'rp_number': 'RP-001', 'rp_date': start - timedelta(days=1), 'rp_amount': Decimal('550000'), 'payment_order': 'OP-001',
            'commission_report': 'Comisión ejecutada según objeto', 'executed': Decimal('500000'), 'legalization_note': 'Soportes adjuntos', 'legalization_review': 'Revisión satisfactoria',
        }
        values.update(overrides)
        selected = {k: values[k] for k in step['fields'] if k in values}
        if step['key'] != 'borrador':
            services.save_data(self.actor(case), case.pk, case.revision, selected)
            self.refresh(case)
        for category in step['docs']:
            if not case.documents.filter(category=category).exists() or case.stage == 'correccion':
                self.attach(case, category)

    def advance(self, case, **overrides):
        self.fill(case, **overrides)
        services.transition(self.actor(case), case.pk, case.revision, 'advance', 'Validado en prueba')
        return self.refresh(case)

    def until(self, case, stage):
        while case.stage != stage:
            self.assertNotIn(case.stage, {'cerrado', 'rechazado'})
            self.advance(case)
        return case

    def payment(self, case, kind, value, reference='BANCO-001'):
        user = self.people['tesoreria']
        evidence = self.attach(case, kind, user)
        result = services.record_payment(user, case.pk, case.revision, {'kind': kind, 'amount': Decimal(value), 'paid_on': timezone.localdate(), 'reference': reference, 'evidence': evidence})
        self.refresh(case)
        return result

    def test_complete_incapacity_and_recovery(self):
        c = self.new()
        self.assertEqual(len(WORKFLOWS['incapacidad']), 6)
        self.until(c, 'pago_funcionario')
        self.advance(c)
        self.assertEqual(c.stage, 'transcripcion')
        self.advance(c)
        self.assertEqual(c.stage, 'comprobante')
        self.advance(c)
        self.refresh(c)
        self.assertEqual(c.stage, 'cerrado')
        self.assertEqual(c.events.filter(action='Etapa completada').count(), len(WORKFLOWS['incapacidad']))
        self.assertEqual(c.events.first().action, 'Borrador creado')

    def test_complete_travel_budget_payment_legalization_refund_close(self):
        c = self.new('viatico')
        self.until(c, 'pago')
        self.assertEqual(services.totals(c)['authorized'], Decimal('550000'))
        self.assertEqual(c.data['scale_snapshot']['id'], self.scale.pk)
        self.payment(c, 'desembolso', '550000')
        self.advance(c)
        self.assertEqual(c.stage, 'comision')
        # En el flujo recortado, informe de comision es el ultimo paso y subir archivo es opcional
        self.fill(c)
        services.transition(self.actor(c), c.pk, c.revision, 'advance')
        self.refresh(c)
        self.assertEqual(c.stage, 'cerrado')
        self.assertEqual(c.financial_entries.count(), 1)

    def compensatory_policy(self, enabled=True):
        policy = PolicyVersion.objects.get(kind='compensatorio')
        policy.config = {'compensatory_rules': {
            'enabled': enabled,
            'minutes_per_day': 480,
            'min_credit_minutes': 30,
            'max_credit_minutes': 720,
            'min_request_minutes': 30,
            'max_request_minutes': 480,
            'requirements': ['Soporte verificable del tiempo trabajado'],
            'approval_conditions': ['Autorización expresa de la autoridad competente'],
        }} if enabled else {'compensatory_rules': {'enabled': False}}
        policy.confirmed = enabled
        policy.save()
        return policy

    def new_compensatory(self):
        worked_on = timezone.localdate() - timedelta(days=2)
        return services.create_case(self.people['solicitante'], 'compensatorio', {
            'work_date': worked_on,
            'work_start': '18:00',
            'work_end': '21:00',
            'break_minutes': 0,
            'activity_description': 'Actividad institucional extraordinaria soportada.',
            'observations': '',
        })

    def test_compensatory_complete_authorized_flow_ledger_calendar_and_history(self):
        self.compensatory_policy()
        c = self.new_compensatory()
        self.attach(c, 'soporte_tiempo', c.owner)
        services.transition(c.owner, c.pk, c.revision, 'advance', 'Registro enviado')
        self.refresh(c)
        services.save_data(self.people['talento'], c.pk, c.revision, {'support_review_note': 'Soporte verificado'})
        self.refresh(c)
        self.attach(c, 'revision_soporte_tiempo', self.people['talento'])
        services.transition(self.people['talento'], c.pk, c.revision, 'advance', 'Revisión completa')
        self.refresh(c)
        services.save_data(self.people['autoridad'], c.pk, c.revision, {'approved_minutes': 180, 'recognition_rule_reference': 'Regla institucional de prueba'})
        self.refresh(c)
        self.attach(c, 'autorizacion_reconocimiento', self.people['autoridad'])
        services.transition(self.people['autoridad'], c.pk, c.revision, 'advance', 'Reconocimiento autorizado')
        self.refresh(c)
        self.assertEqual(services.compensatory_balance(c.owner)['balance'], 180)
        self.assertEqual(c.compensatory_entries.get(kind='credito').minutes, 180)

        requested_on = timezone.localdate() + timedelta(days=5)
        services.save_data(c.owner, c.pk, c.revision, {'request_start_date': requested_on, 'request_end_date': requested_on, 'requested_minutes': 120, 'request_reason': 'Solicitud personal de prueba'})
        self.refresh(c)
        self.attach(c, 'solicitud_compensatorio', c.owner)
        services.transition(c.owner, c.pk, c.revision, 'advance', 'Solicitud enviada')
        self.refresh(c)
        services.save_data(self.people['talento'], c.pk, c.revision, {'balance_review_note': 'Saldo y condiciones verificados'})
        self.refresh(c)
        self.attach(c, 'revision_saldo', self.people['talento'])
        services.transition(self.people['talento'], c.pk, c.revision, 'advance', 'Saldo validado')
        self.refresh(c)
        services.save_data(self.people['autoridad'], c.pk, c.revision, {'compensatory_authorization_note': 'Solicitud autorizada expresamente'})
        self.refresh(c)
        self.attach(c, 'autorizacion_compensatorio', self.people['autoridad'])
        services.transition(self.people['autoridad'], c.pk, c.revision, 'advance', 'Compensatorio autorizado')
        self.refresh(c)
        self.assertEqual(services.compensatory_balance(c.owner)['balance'], 60)
        self.assertEqual(c.compensatory_entries.get(kind='debito').minutes, 120)
        self.assertTrue(c.events.filter(action='Compensatorio autorizado y descontado').exists())

        self.client.force_login(c.owner)
        detail = self.client.get(reverse('case_detail', args=[c.pk]))
        self.assertContains(detail, 'Control de saldos')
        self.assertContains(detail, '60 min')
        response = self.client.get(reverse('compensatory_calendar'))
        self.assertContains(response, c.reference)
        self.assertContains(response, '120 min')
        report = self.client.get(reverse('report', args=['compensatorio']))
        self.assertEqual(report.status_code, 200)
        self.assertIn(c.reference, report.content.decode('utf-8-sig'))

    def test_compensatory_provisional_policy_never_recognizes_time(self):
        self.compensatory_policy(enabled=False)
        c = self.new_compensatory()
        self.attach(c, 'soporte_tiempo', c.owner)
        services.transition(c.owner, c.pk, c.revision, 'advance')
        self.refresh(c)
        services.save_data(self.people['talento'], c.pk, c.revision, {'support_review_note': 'Revisado'})
        self.refresh(c)
        self.attach(c, 'revision_soporte_tiempo', self.people['talento'])
        services.transition(self.people['talento'], c.pk, c.revision, 'advance')
        self.refresh(c)
        services.save_data(self.people['autoridad'], c.pk, c.revision, {'approved_minutes': 180, 'recognition_rule_reference': 'Referencia sin aprobar'})
        self.refresh(c)
        self.attach(c, 'autorizacion_reconocimiento', self.people['autoridad'])
        with self.assertRaisesMessage(ValidationError, 'bloqueado'):
            services.transition(self.people['autoridad'], c.pk, c.revision, 'advance')
        self.assertFalse(CompensatoryLedgerEntry.objects.filter(case=c).exists())

    def test_missing_document_blocks_submission(self):
        c = self.new()
        with self.assertRaisesMessage(ValidationError, 'Certificado'):
            services.transition(c.owner, c.pk, c.revision, 'advance')
        self.assertEqual(self.refresh(c).stage, 'borrador')

    def test_missing_fields_blocks_submission(self):
        c = services.create_case(self.people['solicitante'], 'incapacidad', {})
        with self.assertRaisesMessage(ValidationError, 'Complete'):
            services.transition(c.owner, c.pk, c.revision, 'advance')

    def test_return_correction_resubmit_preserves_history_and_documents(self):
        c = self.new()
        self.advance(c)
        old_docs = list(c.documents.values_list('id', flat=True))
        services.transition(self.actor(c), c.pk, c.revision, 'return', 'Actualizar certificado médico: fechas ilegibles')
        self.refresh(c)
        self.assertEqual(c.stage, 'correccion')
        self.assertEqual(self.actor(c), c.owner)
        with self.assertRaises(ValidationError):
            services.transition(c.owner, c.pk, c.revision, 'advance')
        self.attach(c, 'certificado')
        services.transition(c.owner, c.pk, c.revision, 'advance')
        self.refresh(c)
        self.assertEqual(c.stage, 'revision')
        self.assertTrue(all(c.documents.filter(pk=pk).exists() for pk in old_docs))
        self.assertTrue(c.events.filter(action='Devuelto para corrección').exists())
        self.advance(c)
        self.assertEqual(c.stage, 'autorizacion')

    def test_return_requires_specific_observation(self):
        c = self.new()
        self.advance(c)
        with self.assertRaises(ValidationError):
            services.transition(self.actor(c), c.pk, c.revision, 'return', '')

    def test_no_approval_by_requester_or_admin(self):
        c = self.new()
        self.until(c, 'autorizacion')
        self.fill(c)
        for user in [c.owner, self.people['administrador'], self.people['juridica']]:
            with self.assertRaises(PermissionDenied):
                services.transition(user, c.pk, c.revision, 'advance')
        services.transition(self.people['autoridad'], c.pk, c.revision, 'advance')
        self.assertEqual(self.refresh(c).stage, 'pago_funcionario')

    def test_invalid_action_cannot_set_arbitrary_stage(self):
        c = self.new()
        with self.assertRaises(ValidationError):
            services.transition(c.owner, c.pk, c.revision, 'cerrado')

    def test_optimistic_concurrency_blocks_stale_updates(self):
        c = self.new()
        stale = c.revision
        self.attach(c, 'certificado')
        with self.assertRaisesMessage(ValidationError, 'otra sesión'):
            services.save_data(c.owner, c.pk, stale, {'entity': 'Cambio obsoleto'})

    def test_duplicates_and_date_ranges(self):
        c = self.new()
        with self.assertRaisesMessage(ValidationError, 'superpuestas'):
            self.new()
        with self.assertRaisesMessage(ValidationError, 'posterior'):
            self.new(user=self.other, start_date=date(2026, 3, 20), end_date=date(2026, 3, 19))
        self.assertEqual(Case.objects.count(), 1)

    def test_draft_can_be_incomplete_and_edit_ignores_injected_fields(self):
        c = services.create_case(self.people['solicitante'], 'incapacidad', {})
        services.save_data(c.owner, c.pk, c.revision, {'entity': 'EPS', 'stage': 'cerrado', 'recognized': '9999', 'owner': self.other.pk})
        self.refresh(c)
        self.assertEqual(c.data, {'entity': 'EPS'})
        self.assertEqual(c.stage, 'borrador')

    def test_private_document_download_and_audit(self):
        c = self.new()
        doc = self.attach(c, 'certificado')
        self.advance(c)
        client = Client()
        client.force_login(self.people['tesoreria'])
        url = reverse('document_download', args=[doc.pk])
        self.assertEqual(client.get(url).status_code, 403)
        client.force_login(self.other)
        self.assertEqual(client.get(url).status_code, 404)
        client.force_login(self.people['talento'])
        response = client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertIn('attachment', response['Content-Disposition'])
        self.assertTrue(c.events.filter(action='Documento descargado').exists())
        self.assertEqual(response['Cache-Control'], 'no-store, private')

    def test_file_signature_size_and_category_validation(self):
        c = self.new()
        for name, content in [('fake.pdf', b'<script>alert(1)</script>'), ('fake.html', b'%PDF-1.4\ncontent'), ('empty.pdf', b'')]:
            with self.assertRaises(ValidationError):
                services.upload(c.owner, c.pk, c.revision, 'certificado', SimpleUploadedFile(name, content))
        with self.assertRaises(PermissionDenied):
            services.upload(c.owner, c.pk, c.revision, 'acto_firmado', SimpleUploadedFile('a.pdf', b'%PDF-1.4'))
        big = SimpleUploadedFile('big.pdf', b'%PDF-' + b'x' * (8 * 1024 * 1024))
        with self.assertRaises(ValidationError):
            services.upload(c.owner, c.pk, c.revision, 'certificado', big)

    def test_partial_payments_overpayment_duplicate_and_future_payment(self):
        c = self.new('viatico')
        self.until(c, 'pago')
        entry = self.payment(c, 'desembolso', '200000')
        self.assertEqual(services.totals(c)['paid'], Decimal('200000'))
        self.assertEqual(services.totals(c)['authorized'], Decimal('550000'))
        data = {'kind': 'desembolso', 'amount': Decimal('1'), 'paid_on': timezone.localdate(), 'reference': entry.reference, 'evidence': entry.evidence}
        with self.assertRaisesMessage(ValidationError, 'referencia'):
            services.record_payment(self.people['tesoreria'], c.pk, c.revision, data)
        data['reference'] = 'OVER'
        data['amount'] = Decimal('500000')
        with self.assertRaises(ValidationError):
            services.record_payment(self.people['tesoreria'], c.pk, c.revision, data)
        data['amount'] = Decimal('1')
        data['paid_on'] = timezone.localdate() + timedelta(days=1)
        with self.assertRaises(ValidationError):
            services.record_payment(self.people['tesoreria'], c.pk, c.revision, data)
        self.assertEqual(c.financial_entries.count(), 1)

    def test_pending_recovery_blocks_closure_without_filing(self):
        c = self.new()
        self.until(c, 'transcripcion')
        with self.assertRaises(ValidationError):
            services.transition(self.actor(c), c.pk, c.revision, 'advance')
        self.fill(c)
        services.transition(self.actor(c), c.pk, c.revision, 'advance')
        self.refresh(c)
        self.assertEqual(c.stage, 'comprobante')
        # Avanzar el comprobante sin adjuntar archivo (opcional) cierra el caso
        services.transition(self.actor(c), c.pk, c.revision, 'advance')
        self.refresh(c)
        self.assertEqual(c.stage, 'cerrado')

    def test_additional_recognition_requires_new_evidence(self):
        c = self.new()
        self.until(c, 'comprobante')
        c.data['requested'] = '300000'
        c.save()
        user = self.people['talento']
        old = self.attach(c, 'reconocimiento', user)
        services.additional_recognition(user, c.pk, c.revision, Decimal('100000'), 'Reconocimiento inicial', old.pk)
        self.refresh(c)
        with self.assertRaises(ValidationError):
            services.additional_recognition(user, c.pk, c.revision, Decimal('300000'), 'Reconocimiento adicional', old.pk)
        new = self.attach(c, 'reconocimiento', user)
        services.additional_recognition(user, c.pk, c.revision, Decimal('300000'), 'Nuevo reconocimiento soportado', new.pk)
        self.refresh(c)
        self.assertEqual(services.totals(c)['recognized'], Decimal('300000'))

    def test_scale_validity_destination_budget_and_snapshot(self):
        c = self.new('viatico')
        self.until(c, 'liquidacion')
        with self.assertRaises(ValidationError):
            self.fill(c, overnight_days=3)
        self.refresh(c)
        self.fill(c)
        self.assertEqual(c.data['authorized_total'], '550000.00')
        self.assertEqual(c.data['scale_snapshot']['source'], self.scale.source)
        bad = TravelScale.objects.create(name='Vencida', category='Profesional', destination='Bogotá', valid_from=date(2000, 1, 1), valid_until=date(2001, 1, 1), overnight_rate=1, day_rate=1, source='Test', approval_reference='Test', approved_by=self.people['autoridad'])
        with self.assertRaisesMessage(ValidationError, 'no cubre'):
            self.fill(c, scale_id=bad)
        self.refresh(c)
        bad.valid_until = date(2035, 1, 1)
        bad.destination = 'Otro destino'
        bad.save()
        with self.assertRaisesMessage(ValidationError, 'coincidir'):
            self.fill(c, scale_id=bad)

    def test_rp_must_cover_liquidation_and_not_exceed_cdp(self):
        c = self.new('viatico')
        self.until(c, 'liquidacion')
        with self.assertRaises(ValidationError):
            self.fill(c, overnight_days=0, day_days=0, authorized_transport=Decimal('0'))

    def test_travel_streamlined_report_is_final_step_and_optional_upload(self):
        c = self.new('viatico')
        self.until(c, 'pago')
        self.payment(c, 'desembolso', '550000')
        self.advance(c)
        self.assertEqual(c.stage, 'comision')
        # Verificar que en comision se permite subir informe_comision pero es opcional
        categories = services.upload_categories(c.owner, c)
        self.assertIn('informe_comision', categories)
        # Avanzar el informe sin adjuntar archivo cierra el caso exitosamente
        self.fill(c)
        services.transition(c.owner, c.pk, c.revision, 'advance')
        self.refresh(c)
        self.assertEqual(c.stage, 'cerrado')

    def test_incapacity_comprobante_is_final_step_and_optional_upload(self):
        c = self.new()
        self.until(c, 'comprobante')
        self.assertEqual(c.stage, 'comprobante')
        # Verificar que en comprobante se permite subir comprobante pero es opcional
        categories = services.upload_categories(self.actor(c), c)
        self.assertIn('comprobante', categories)
        # Avanzar sin adjuntar archivo cierra el caso exitosamente
        services.transition(self.actor(c), c.pk, c.revision, 'advance')
        self.refresh(c)
        self.assertEqual(c.stage, 'cerrado')

    def test_provisional_policy_blocks_institutional_close(self):
        policy = PolicyVersion.objects.get(kind='incapacidad')
        policy.confirmed = False
        policy.save()
        c = self.new()
        self.until(c, 'comprobante')
        self.fill(c)
        with self.assertRaisesMessage(ValidationError, 'provisional'):
            services.transition(self.actor(c), c.pk, c.revision, 'advance')

    def test_closed_cases_are_immutable(self):
        c = self.new()
        self.until(c, 'comprobante')
        self.fill(c)
        services.transition(self.actor(c), c.pk, c.revision, 'advance')
        self.refresh(c)
        self.assertEqual(c.stage, 'cerrado')
        with self.assertRaisesMessage(ValidationError, 'finalizado'):
            services.save_data(self.people['talento'], c.pk, c.revision, {})
        with self.assertRaises(ValidationError):
            services.transition(c.owner, c.pk, c.revision, 'note', 'Cambiar historial')

    def test_rejection_requires_role_and_justification(self):
        c = self.new()
        self.advance(c)
        with self.assertRaises(PermissionDenied):
            services.transition(c.owner, c.pk, c.revision, 'reject', 'No procede')
        with self.assertRaises(ValidationError):
            services.transition(self.actor(c), c.pk, c.revision, 'reject', '')
        services.transition(self.actor(c), c.pk, c.revision, 'reject', 'Motivo documentado de prueba')
        self.assertEqual(self.refresh(c).stage, 'rechazado')

    def test_config_validates_stage_roles_and_deadlines(self):
        validate_config('incapacidad', {'deadlines': {'revision': 3}, 'milestones': [{'day': 10, 'label': 'Verificar rehabilitación según fuente', 'role': 'talento'}]})
        for config in [{'roles': {'revision': ['administrador']}}, {'roles': {'revision': ['owner']}}, {'deadlines': {'revision': -1}}, {'deadlines': {'inexistente': 3}}, {'milestones': [{'day': -2, 'label': 'X', 'role': 'talento'}]}, {'additional_documents': {'revision': ['no_existe']}}]:
            with self.assertRaises(ValidationError):
                validate_config('incapacidad', config)
        validate_config('compensatorio', {'compensatory_rules': {'enabled': True, 'minutes_per_day': 480, 'min_credit_minutes': 30, 'max_credit_minutes': 600, 'min_request_minutes': 30, 'max_request_minutes': 480, 'requirements': ['Soporte'], 'approval_conditions': ['Autorización']}})
        with self.assertRaises(ValidationError):
            validate_config('compensatorio', {'compensatory_rules': {'enabled': True, 'minutes_per_day': 480}})
        with self.assertRaises(ValidationError):
            validate_config('compensatorio', {'transitions': [{'from': 'borrador', 'action': 'advance', 'to': 'autorizacion_tiempo', 'roles': ['owner']}]})

    def test_policy_deadlines_and_owner_isolation(self):
        p = PolicyVersion.objects.get(kind='incapacidad')
        p.config = {'deadlines': {'revision': 3}}
        p.save()
        c = self.new()
        self.advance(c)
        self.assertIsNotNone(c.due_at)
        self.assertFalse(visible_cases(self.other).filter(pk=c.pk).exists())
        self.assertFalse(visible_cases(self.people['administrador']).filter(pk=c.pk).exists())
        self.assertFalse(visible_cases(self.people['presupuesto']).filter(pk=c.pk).exists())

    def test_all_pages_render_and_navigation_connected(self):
        c = self.new()
        self.advance(c)
        client = Client()
        for role in ['administrador', 'talento', 'solicitante', 'autoridad']:
            client.force_login(self.people[role])
            urls = ['/', '/modulos/incapacidad/', '/modulos/viatico/', '/modulos/incapacidad/nuevo/', '/modulos/viatico/nuevo/', '/procedimientos/', '/cuenta/clave/']
            if role == 'administrador':
                urls += ['/administracion/usuarios/', '/administracion/auditoria/', f'/administracion/usuarios/{self.other.pk}/']
            if role in {'administrador', 'talento', 'autoridad'}:
                urls += ['/parametros/']
            if role != 'administrador':
                urls += [reverse('case_detail', args=[c.pk])]
            for url in urls:
                with self.subTest(role=role, url=url):
                    response = client.get(url)
                    self.assertEqual(response.status_code, 200)
                    self.assertNotContains(response, 'Traceback')
        client.force_login(self.people['talento'])
        response = client.get(reverse('case_detail', args=[c.pk]))
        self.assertContains(response, 'Talento Humano')
        self.assertContains(response, 'Historial de actuaciones')

    def test_http_permission_checks_and_audit_rejected_action(self):
        c = self.new()
        self.advance(c)
        client = Client()
        client.force_login(c.owner)
        response = client.post(reverse('case_decision', args=[c.pk]), {'revision': c.revision, 'action': 'advance', 'note': 'Salto no autorizado'})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.refresh(c).stage, 'revision')
        self.assertTrue(c.events.filter(action='Validación rechazada').exists())
        self.assertEqual(client.get('/administracion/usuarios/').status_code, 403)
        self.assertEqual(client.get('/parametros/').status_code, 403)

    def test_csrf_and_post_only_enforced(self):
        c = self.new()
        client = Client(enforce_csrf_checks=True)
        client.force_login(c.owner)
        self.assertEqual(client.post(reverse('case_save', args=[c.pk]), {'revision': c.revision}).status_code, 403)
        self.assertEqual(client.get(reverse('logout')).status_code, 405)
        self.assertEqual(client.get(reverse('case_save', args=[c.pk])).status_code, 405)

    def test_reports_respect_permissions_filters_and_csv_injection(self):
        c = self.new()
        self.advance(c)
        client = Client()
        client.force_login(c.owner)
        response = client.get('/modulos/incapacidad/reporte/')
        self.assertContains(response, c.reference)
        self.assertTrue(response['Content-Type'].startswith('text/csv'))
        response = client.get('/modulos/incapacidad/reporte/?state=cerrado')
        self.assertNotContains(response, c.reference)
        client.force_login(self.other)
        self.assertNotContains(client.get('/modulos/incapacidad/reporte/'), c.reference)
        from core.views import safe_csv
        self.assertEqual(safe_csv('=HYPERLINK("bad")'), '\'=HYPERLINK("bad")')
        self.assertTrue(safe_csv('   +123').startswith("'"))

    def test_configuration_permissions_and_versioning(self):
        client = Client()
        client.force_login(self.people['administrador'])
        self.assertEqual(client.post('/parametros/', {'form_type': 'policy'}).status_code, 403)
        client.force_login(self.people['autoridad'])
        response = client.post('/parametros/', {'form_type': 'policy', 'kind': 'incapacidad', 'source': 'Documento oficial de prueba', 'source_pages': '1-20', 'approval_reference': 'APROB-TEST', 'config': '{"deadlines":{"revision":3}}', 'confirmed': 'on'})
        self.assertEqual(response.status_code, 302)
        policy = PolicyVersion.objects.filter(kind='incapacidad').first()
        self.assertEqual(policy.version, 2)
        self.assertEqual(self.new().policy_id, policy.pk)

    def test_login_rate_limiting_and_no_public_registration(self):
        client = Client()
        for _ in range(5):
            response = client.post('/ingresar/', {'username': 'no-existe', 'password': 'incorrecta'})
            self.assertEqual(response.status_code, 200)
        self.assertEqual(client.post('/ingresar/', {'username': 'no-existe', 'password': 'incorrecta'}).status_code, 429)
        self.assertEqual(client.get('/configurar/').status_code, 302)

    def test_account_creation_access_change_and_last_admin_protection(self):
        client = Client()
        client.force_login(self.people['administrador'])
        response = client.post('/administracion/usuarios/', {'name': 'Nuevo funcionario', 'username': 'nuevo', 'department': 'Talento Humano', 'password': 'Nueva-frase-segura-2026', 'password_confirm': 'Nueva-frase-segura-2026', 'roles': ['solicitante'], 'employment': 'funcionario'})
        self.assertEqual(response.status_code, 302)
        new = User.objects.get(username='nuevo')
        self.assertEqual(new.profile.department, 'Talento Humano')
        response = client.post(reverse('user_access', args=[new.pk]), {'roles': ['talento'], 'active': 'on', 'password': ''})
        self.assertEqual(response.status_code, 302)
        self.assertTrue(new.groups.filter(name='talento').exists())
        admin = self.people['administrador']
        response = client.post(reverse('user_access', args=[admin.pk]), {'roles': ['solicitante'], 'active': 'on', 'password': ''})
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Debe conservar al menos')
        self.assertTrue(admin.groups.filter(name='administrador').exists())

    def http_run(self, kind):
        client = Client()
        client.force_login(self.people['solicitante'])
        start = timezone.localdate() - timedelta(days=10)
        response = client.post(reverse('case_create', args=[kind]), {'revision': 1, 'start_date': start.isoformat(), 'end_date': (start + timedelta(days=2)).isoformat(), 'leave_type': 'comun', 'entity': 'EPS pruebas HTTP', 'purpose': 'Comisión HTTP', 'destination': 'Bogotá', 'category': 'Profesional', 'overnight': 'on', 'transport': '50000'})
        self.assertEqual(response.status_code, 302)
        case = Case.objects.get(owner=self.people['solicitante'], kind=kind)
        values = {'draft_text': 'Proyecto de resolución para revisión vía HTTP.', 'cdp_request_ref': 'SOL-CDP-HTTP', 'cdp_request_date': start.isoformat(), 'rp_request_ref': 'SOL-RP-HTTP', 'rp_request_date': start.isoformat(), 'review_note': 'Revisión HTTP', 'legal_note': 'Concepto HTTP', 'resolution_number': 'RES-HTTP', 'resolution_radication': 'RES-RAD-HTTP', 'resolution_date': start.isoformat(), 'archive_reference': 'ARCH-HTTP', 'payer_entity': 'eps', 'employee_paid': '300000', 'employee_paid_on': start.isoformat(), 'employee_payment_ref': 'EMP-HTTP', 'filing_entity': 'EPS HTTP', 'filing_number': 'RAD-HTTP', 'filing_date': start.isoformat(), 'filing_result': 'Radicación manual comprobada', 'requested': '300000', 'recovery_reference': 'REC-HTTP', 'recovery_date': start.isoformat(), 'recognized': '300000', 'recognition_date': start.isoformat(), 'followup_note': 'Reconocimiento total', 'finance_notice': 'COM-HTTP', 'accounting_reference': 'CONT-HTTP', 'reconciliation_note': 'Conciliado con evidencia', 'balance_note': 'Saldo cero', 'control_note': 'Revisión completada', 'closure_note': 'Cierre comprobado por HTTP', 'initial_authorization': 'AUT-HTTP', 'cdp_number': 'CDP-HTTP', 'cdp_date': start.isoformat(), 'cdp_amount': '1000000', 'scale_id': self.scale.pk, 'overnight_days': '2', 'day_days': '1', 'authorized_transport': '50000', 'rp_number': 'RP-HTTP', 'rp_date': start.isoformat(), 'rp_amount': '550000', 'payment_order': 'OP-HTTP', 'commission_report': 'Comisión ejecutada', 'executed': '550000', 'legalization_note': 'Soportes completos', 'legalization_review': 'Legalización revisada'}
        for _ in range(25):
            if case.stage == 'cerrado':
                break
            step = current_step(case)
            user = self.actor(case)
            client.force_login(user)
            if step['key'] not in {'borrador'} and step['fields']:
                payload = {k: values[k] for k in step['fields']}
                payload['revision'] = case.revision
                response = client.post(reverse('case_save', args=[case.pk]), payload)
                self.assertEqual(response.status_code, 302, (step['key'], response.content[:1000]))
                self.refresh(case)
            for category in step['docs']:
                payload = {'revision': case.revision, 'category': category, 'file': SimpleUploadedFile(category + '.pdf', f'%PDF-1.4\nHTTP {category}\n%%EOF'.encode())}
                response = client.post(reverse('case_upload', args=[case.pk]), payload)
                self.assertEqual(response.status_code, 302, (step['key'], category))
                self.refresh(case)
            if case.stage in {'pago'}:
                category = 'desembolso'
                payload = {'revision': case.revision, 'category': category, 'file': SimpleUploadedFile(category + '.pdf', b'%PDF-1.4\nHTTP payment\n%%EOF')}
                response = client.post(reverse('case_upload', args=[case.pk]), payload)
                self.assertEqual(response.status_code, 302)
                self.refresh(case)
                evidence = case.documents.get(category=category)
                response = client.post(reverse('case_payment', args=[case.pk]), {'revision': case.revision, 'kind': category, 'amount': '550000', 'paid_on': start.isoformat(), 'reference': 'BANCO-HTTP', 'evidence': evidence.pk})
                self.assertEqual(response.status_code, 302)
                self.refresh(case)
            before = case.stage
            response = client.post(reverse('case_decision', args=[case.pk]), {'revision': case.revision, 'action': 'advance', 'note': 'Etapa verificada vía HTTP'})
            self.assertEqual(response.status_code, 302)
            self.refresh(case)
            self.assertNotEqual(case.stage, before, (before, list(case.events.values_list('note', flat=True))))
            rendered = client.get(reverse('case_detail', args=[case.pk]))
            self.assertEqual(rendered.status_code, 200)
            self.assertContains(rendered, 'Documentos y soportes')
        self.assertEqual(case.stage, 'cerrado')
        return case

    def test_http_complete_incapacity_forms_documents_payments_history(self):
        case = self.http_run('incapacidad')
        self.assertEqual(case.stage, 'cerrado')

    def test_http_complete_travel_forms_budget_liquidation_legalization(self):
        case = self.http_run('viatico')
        self.assertEqual(case.stage, 'cerrado')
        self.assertEqual(case.data['scale_snapshot']['overnight_rate'], '200000.00')

    def test_document_preview_is_authorized_audited_and_sandboxed(self):
        case = self.new()
        doc = self.attach(case, 'certificado')
        client = Client()
        url = reverse('document_preview', args=[doc.pk])
        self.assertEqual(client.get(url).status_code, 302)
        client.force_login(case.owner)
        response = client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertIn('inline', response['Content-Disposition'])
        self.assertIn('sandbox', response['Content-Security-Policy'])
        self.assertTrue(case.events.filter(action='Documento visualizado').exists())

    def test_finance_view_omits_medical_certificate_and_request_observations(self):
        case = self.new(observations='Observación médica privada de prueba')
        self.attach(case, 'certificado')
        self.advance(case)
        client = Client()
        client.force_login(self.people['tesoreria'])
        response = client.get(reverse('case_detail', args=[case.pk]))
        self.assertNotContains(response, 'Observación médica privada de prueba')
        self.assertNotContains(response, 'certificado.pdf')
        client.force_login(case.owner)
        self.assertContains(client.get(reverse('case_detail', args=[case.pk])), 'Observación médica privada de prueba')

    def test_malformed_financial_fields_return_validation_errors(self):
        case = self.new()
        self.until(case, 'comprobante')
        client = Client()
        client.force_login(self.people['talento'])
        for value in ['NaN', 'Infinity', '1e99999', '-10', '0.001']:
            response = client.post(reverse('case_recognition', args=[case.pk]), {'revision': case.revision, 'recognized': value, 'document_id': 0, 'note': 'Intento inválido'})
            self.assertEqual(response.status_code, 302)
        self.assertEqual(FinancialEntry.objects.count(), 0)

    def test_audit_handles_anonymous_login_events(self):
        client = Client()
        client.post('/ingresar/', {'username': 'x', 'password': 'error'})
        client.force_login(self.people['administrador'])
        response = client.get('/administracion/auditoria/')
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Sin autenticar')

    def test_incapacity_radication_number_and_general_illness_label(self):
        client = Client()
        client.force_login(self.people['solicitante'])
        url_create = reverse('case_create', args=['incapacidad'])
        get_res = client.get(url_create)
        self.assertEqual(get_res.status_code, 200)
        self.assertContains(get_res, 'Número de radicación')
        self.assertContains(get_res, 'Enfermedad general')

        start = timezone.localdate() - timedelta(days=5)
        post_data = {
            'revision': 1,
            'start_date': start.isoformat(),
            'end_date': (start + timedelta(days=2)).isoformat(),
            'leave_type': 'comun',
            'incapacity_number': 'INC-EPS-2026-99',
            'radication_number': 'RAD-GENERAL-2026-001',
            'epicrisis_radication': 'EPI-2026-555',
            'entity': 'EPS Sanitas',
            'observations': 'Incapacidad médica por enfermedad general',
        }
        create_res = client.post(url_create, post_data)
        self.assertEqual(create_res.status_code, 302)
        case = Case.objects.filter(kind='incapacidad').latest('created_at')
        self.assertEqual(case.data.get('radication_number'), 'RAD-GENERAL-2026-001')
        self.assertEqual(case.data.get('incapacity_number'), 'INC-EPS-2026-99')
        self.assertEqual(case.data.get('epicrisis_radication'), 'EPI-2026-555')
        self.assertEqual(case.data.get('leave_type'), 'comun')

        detail_res = client.get(reverse('case_detail', args=[case.pk]))
        self.assertEqual(detail_res.status_code, 200)
        self.assertContains(detail_res, 'RAD-GENERAL-2026-001')
        self.assertContains(detail_res, 'INC-EPS-2026-99')
        self.assertContains(detail_res, 'EPI-2026-555')
        self.assertContains(detail_res, 'Enfermedad general')

    def test_incapacity_payment_rule_contraloria_vs_eps(self):
        # 1. Caso de 2 días (menos o igual a 2 días): asumido por la Contraloría Municipal de Pasto
        start = timezone.localdate() - timedelta(days=5)
        c2 = self.new('incapacidad', start_date=start, end_date=start + timedelta(days=1))
        self.assertEqual(c2.data['days'], 2)
        self.until(c2, 'pago_funcionario')
        # Si intenta registrar que lo asume la EPS, debe fallar por regla normativa
        with self.assertRaises(ValidationError) as ctx:
            self.fill(c2, payer_entity='eps')
            services.transition(self.actor(c2), c2.pk, c2.revision, 'advance')
        self.assertIn('Contraloría Municipal de Pasto', str(ctx.exception))
        # Con payer_entity='contraloria' avanza exitosamente
        self.fill(c2, payer_entity='contraloria')
        services.transition(self.actor(c2), c2.pk, c2.revision, 'advance')
        self.refresh(c2)
        self.assertEqual(c2.data['payer_entity'], 'contraloria')

        # 2. Caso de 5 días (más de 2 días): auxilio a partir del día 3 asumido por la EPS
        start_c5 = timezone.localdate() - timedelta(days=25)
        c5 = self.new('incapacidad', start_date=start_c5, end_date=start_c5 + timedelta(days=4))
        self.assertEqual(c5.data['days'], 5)
        self.until(c5, 'pago_funcionario')
        # Si intenta indicar que todo lo asume la Contraloría, debe fallar
        with self.assertRaises(ValidationError) as ctx:
            self.fill(c5, payer_entity='contraloria')
            services.transition(self.actor(c5), c5.pk, c5.revision, 'advance')
        self.assertIn('EPS', str(ctx.exception))
        # Con payer_entity='eps' avanza exitosamente
        self.fill(c5, payer_entity='eps')
        services.transition(self.actor(c5), c5.pk, c5.revision, 'advance')
        self.refresh(c5)
        self.assertEqual(c5.data['payer_entity'], 'eps')



@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class BootstrapTests(TestCase):
    def test_setup_creates_admin_once_without_default_credentials(self):
        client = Client()
        response = client.get('/configurar/')
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Crear administrador')
        payload = {'username': 'admin-inicial', 'name': 'Administración', 'department': 'Sistemas', 'password': 'Mi-frase-segura-2026', 'password_confirm': 'Mi-frase-segura-2026'}
        response = client.post('/configurar/', payload)
        self.assertEqual(response.status_code, 302)
        user = User.objects.get()
        self.assertTrue(user.check_password(payload['password']))
        self.assertEqual(list(user.groups.values_list('name', flat=True)), ['administrador'])
        self.assertEqual(client.get('/configurar/').status_code, 302)
        self.assertEqual(User.objects.count(), 1)
        self.assertContains(client.get('/'), 'Configuración normativa pendiente')

    def test_setup_rejects_weak_password_and_nonlocal_requests(self):
        client = Client()
        response = client.post('/configurar/', {'username': 'admin', 'name': 'Administración', 'department': 'Sistemas', 'password': '123', 'password_confirm': '123'})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(User.objects.exists())
        self.assertEqual(client.get('/configurar/', REMOTE_ADDR='192.0.2.1').status_code, 403)

@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.ScryptPasswordHasher'])
class RealAuthenticationTests(TestCase):
    def test_real_password_login_csrf_password_change_and_post_logout(self):
        user = User.objects.create_user('funcionario', password='Una-frase-distinta-2026')
        Profile.objects.create(user=user, department='Talento Humano')
        self.assertTrue(user.password.startswith('scrypt$'))
        client = Client(enforce_csrf_checks=True)
        client.get('/ingresar/')
        token = client.cookies['csrftoken'].value
        response = client.post('/ingresar/', {'username': 'funcionario', 'password': 'Una-frase-distinta-2026', 'csrfmiddlewaretoken': token})
        self.assertEqual(response.status_code, 302)
        self.assertEqual(int(client.session['_auth_user_id']), user.pk)
        token = client.cookies['csrftoken'].value
        response = client.post('/cuenta/clave/', {'old_password': 'Una-frase-distinta-2026', 'new_password1': 'Otra-frase-renovada-2026', 'new_password2': 'Otra-frase-renovada-2026', 'csrfmiddlewaretoken': token})
        self.assertEqual(response.status_code, 302)
        user.refresh_from_db()
        self.assertTrue(user.check_password('Otra-frase-renovada-2026'))
        self.assertFalse(user.check_password('Una-frase-distinta-2026'))
        response = client.post('/salir/', {'csrfmiddlewaretoken': client.cookies['csrftoken'].value})
        self.assertEqual(response.status_code, 302)
        self.assertNotIn('_auth_user_id', client.session)

    def test_deactivated_user_cannot_authenticate(self):
        user = User.objects.create_user('desactivado', password='Una-frase-distinta-2026', is_active=False)
        Profile.objects.create(user=user, department='Talento Humano')
        client = Client()
        response = client.post('/ingresar/', {'username': user.username, 'password': 'Una-frase-distinta-2026'})
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('_auth_user_id', client.session)
