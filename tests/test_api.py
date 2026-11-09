import json
from datetime import date, timedelta
from decimal import Decimal
from django.contrib.auth.models import Group, User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from core.models import PolicyVersion, Profile, ROLES, TravelScale
from core.workflows import WORKFLOWS


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class ApiOOPWorkflowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.people = {}
        for key, label in ROLES:
            u = User.objects.create_user(key, password='Una-clave-segura-2026', first_name=label)
            Profile.objects.create(user=u, department='Dirección administrativa')
            u.groups.add(Group.objects.create(name=key))
            cls.people[key] = u
        for kind in WORKFLOWS:
            PolicyVersion.objects.create(
                kind=kind,
                version=1,
                confirmed=True,
                source='Fuente exclusiva de prueba',
                source_pages='1-9',
                approval_reference='Aprobación de prueba',
                config={},
            )
        cls.scale = TravelScale.objects.create(
            name='Escala API',
            category='Profesional',
            destination='Bogotá',
            valid_from=date(2020, 1, 1),
            valid_until=date(2035, 12, 31),
            overnight_rate=Decimal('200000'),
            day_rate=Decimal('100000'),
            source='Fuente de prueba',
            approval_reference='Prueba',
            approved_by=cls.people['autoridad'],
        )

    def test_api_session_and_login_flow(self):
        res = self.client.get(reverse('api_session'))
        self.assertEqual(res.status_code, 200)
        payload = res.json()
        self.assertTrue(payload['ok'])
        self.assertFalse(payload['data']['authenticated'])

        login_res = self.client.post(
            reverse('api_login'),
            data=json.dumps({'username': 'solicitante', 'password': 'Una-clave-segura-2026'}),
            content_type='application/json',
        )
        self.assertEqual(login_res.status_code, 200)
        self.assertTrue(login_res.json()['ok'])

        res2 = self.client.get(reverse('api_session'))
        self.assertTrue(res2.json()['data']['authenticated'])
        self.assertEqual(res2.json()['data']['user']['username'], 'solicitante')

    def test_api_create_upload_save_and_advance_case(self):
        self.client.force_login(self.people['solicitante'])
        start = timezone.localdate() - timedelta(days=5)
        end = start + timedelta(days=1)

        create_res = self.client.post(
            reverse('api_case_module', args=['incapacidad']),
            data=json.dumps({
                'start_date': str(start),
                'end_date': str(end),
                'leave_type': 'comun',
                'entity': 'EPS API',
                'observations': 'Prueba API POO',
            }),
            content_type='application/json',
        )
        self.assertEqual(create_res.status_code, 201)
        case_data = create_res.json()['data']['case']
        case_id = case_data['id']
        self.assertEqual(case_data['stage'], 'borrador')

        pdf = SimpleUploadedFile('certificado.pdf', b'%PDF-1.4\nCertificado\n%%EOF', content_type='application/pdf')
        up_res = self.client.post(
            reverse('api_case_upload', args=[case_id]),
            data={'revision': case_data['revision'], 'category': 'certificado', 'file': pdf},
        )
        self.assertEqual(up_res.status_code, 200)
        case_data = up_res.json()['data']
        self.assertEqual(len(case_data['documents']), 1)

        adv_res = self.client.post(
            reverse('api_case_decision', args=[case_id]),
            data=json.dumps({
                'revision': case_data['revision'],
                'action': 'advance',
                'note': 'Enviado desde React POO',
            }),
            content_type='application/json',
        )
        self.assertEqual(adv_res.status_code, 200)
        self.assertEqual(adv_res.json()['data']['stage'], 'revision')

    def test_api_dashboard_procedures_and_admin_endpoints(self):
        self.client.force_login(self.people['administrador'])
        dash = self.client.get(reverse('api_dashboard'))
        self.assertEqual(dash.status_code, 200)
        self.assertTrue(dash.json()['ok'])

        proc = self.client.get(reverse('api_procedures'))
        self.assertEqual(proc.status_code, 200)
        self.assertEqual(len(proc.json()['data']['modules']), 4)

        users_res = self.client.get(reverse('api_users'))
        self.assertEqual(users_res.status_code, 200)
        self.assertGreaterEqual(len(users_res.json()['data']['users']), 10)

        audit_res = self.client.get(reverse('api_audit'))
        self.assertEqual(audit_res.status_code, 200)
        self.assertTrue(audit_res.json()['ok'])

    def test_api_vacaciones_module_and_user_employment_fields(self):
        from core import vacations

        vacations.load_holidays(2026)
        self.client.force_login(self.people['administrador'])
        solicitante = self.people['solicitante']
        access_res = self.client.post(
            reverse('api_user_access', args=[solicitante.pk]),
            data=json.dumps({
                'roles': ['solicitante'],
                'active': True,
                'department': 'Dirección administrativa',
                'employment': 'funcionario',
                'cedula': '1085000111',
                'cargo': 'Profesional Universitario',
                'codigo': '219',
                'grado': '02',
                'hire_date': '2024-01-15',
                'is_jefe': False,
            }),
            content_type='application/json',
        )
        self.assertEqual(access_res.status_code, 200)

        self.client.force_login(solicitante)
        create_res = self.client.post(
            reverse('api_case_module', args=['vacaciones']),
            data=json.dumps({
                'start_date': '2026-06-01',
                'business_days': 5,
                'observations': 'Solicitud de vacaciones desde API POO',
            }),
            content_type='application/json',
        )
        self.assertEqual(create_res.status_code, 201)
        case_data = create_res.json()['data']['case']
        self.assertEqual(case_data['kind'], 'vacaciones')
        self.assertIsNotNone(case_data['vacation'])
        self.assertGreaterEqual(len(case_data['vacation']['periods']), 1)

        dash_res = self.client.get(reverse('api_vacation_dashboard'), {'year': '2026'})
        self.assertEqual(dash_res.status_code, 200)
        dash_payload = dash_res.json()['data']
        self.assertEqual(dash_payload['year'], 2026)
        self.assertGreaterEqual(len(dash_payload['schedule']), 1)
        self.assertGreaterEqual(len(dash_payload['holidays']), 18)

        self.client.force_login(self.people['talento'])
        hol_res = self.client.post(
            reverse('api_vacation_dashboard'),
            data=json.dumps({
                'action': 'save_holiday',
                'date': '2026-06-24',
                'name': 'Día institucional de prueba',
            }),
            content_type='application/json',
        )
        self.assertEqual(hol_res.status_code, 200)
        self.assertTrue(hol_res.json()['ok'])
