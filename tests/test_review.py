"""Regresiones de acceso, privacidad y coherencia del flujo de trabajo."""
import json
from datetime import date

from django.contrib.auth.models import Group, User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings
from django.urls import reverse

from core import services, vacations
from core.models import Case, Holiday, PolicyVersion, Profile


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class ApplicationReviewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.users = {}
        for role in ('administrador', 'talento', 'solicitante', 'tesoreria', 'juridica'):
            user = User.objects.create_user(role, password='Acceso-pruebas-local-2026', first_name=role)
            user.groups.add(Group.objects.create(name=role))
            Profile.objects.create(user=user, department='Pruebas', hire_date=date(2023, 1, 1))
            cls.users[role] = user
        cls.policy = PolicyVersion.objects.create(kind='incapacidad', version=1, confirmed=True, config={})

    def post_json(self, name, body, args=None):
        return self.client.post(reverse(name, args=args), json.dumps(body), content_type='application/json')

    def make_case(self, stage='revision'):
        return Case.objects.create(
            kind='incapacidad', owner=self.users['solicitante'], department='Pruebas',
            policy=self.policy, stage=stage,
            data={'start_date': '2026-11-01', 'end_date': '2026-11-03',
                  'observations': 'Observación médica privada', 'entity': 'Entidad privada', 'requested': '1000'},
        )

    def test_session_csrf_login_logout_and_private_endpoint(self):
        client = Client(enforce_csrf_checks=True, HTTP_HOST='localhost:5173')
        client.get(reverse('api_session'))
        payload = json.dumps({'username': 'solicitante', 'password': 'Acceso-pruebas-local-2026'})
        self.assertEqual(client.post(reverse('api_login'), payload, content_type='application/json').status_code, 403)
        result = client.post(reverse('api_login'), payload, content_type='application/json',
                             HTTP_X_CSRFTOKEN=client.cookies['csrftoken'].value, HTTP_ORIGIN='http://localhost:5173')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(client.get(reverse('api_dashboard')).status_code, 200)
        result = client.post(reverse('api_logout'), '{}', content_type='application/json',
                             HTTP_X_CSRFTOKEN=client.cookies['csrftoken'].value, HTTP_ORIGIN='http://localhost:5173')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(client.get(reverse('api_dashboard')).status_code, 401)

    def test_personnel_directory_and_writes_require_manager(self):
        self.client.force_login(self.users['solicitante'])
        self.assertEqual(self.client.get(reverse('api_hojas_vida_list')).status_code, 403)
        target = self.users['administrador']
        self.assertEqual(self.client.get(reverse('api_hoja_vida_detail', args=[target.pk])).status_code, 403)
        response = self.post_json('api_hoja_vida_detail', {'roles': ['administrador']}, [self.users['solicitante'].pk])
        self.assertEqual(response.status_code, 403)
        self.assertFalse(self.users['solicitante'].groups.filter(name='administrador').exists())

    def test_talento_can_edit_profile_but_cannot_grant_access(self):
        self.client.force_login(self.users['talento'])
        target = self.users['solicitante']
        self.assertEqual(self.client.get(reverse('api_hojas_vida_list')).status_code, 200)
        self.assertEqual(self.post_json('api_hoja_vida_detail', {'department': 'Pruebas', 'cargo': 'Analista'}, [target.pk]).status_code, 200)
        self.assertEqual(self.post_json('api_hoja_vida_detail', {'roles': ['administrador']}, [target.pk]).status_code, 403)
        self.assertEqual(self.post_json('api_hojas_vida_list', {'name': 'Prueba'}, []).status_code, 403)

    def test_personnel_documents_are_private(self):
        owner = self.users['solicitante']
        document = services.upload_employee_document(self.users['talento'], owner, 'hoja_vida',
            SimpleUploadedFile('hoja.pdf', b'%PDF-1.4\nPrueba\n%%EOF', content_type='application/pdf'))
        self.client.force_login(self.users['tesoreria'])
        for endpoint in ('employee_document_preview', 'employee_document_download'):
            self.assertEqual(self.client.get(reverse(endpoint, args=[document.pk])).status_code, 403)
        self.client.force_login(owner)
        response = self.client.get(reverse('employee_document_preview', args=[document.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertIn('sandbox', response['Content-Security-Policy'])

    def test_personnel_creation_requires_a_valid_password(self):
        self.client.force_login(self.users['administrador'])
        for password in ('', '123'):
            response = self.post_json('api_hojas_vida_list', {
                'name': 'Persona de prueba', 'username': 'persona.nueva', 'department': 'Pruebas', 'password': password,
            })
            self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(username='persona.nueva').exists())

    def test_cannot_disable_last_administrator_via_personnel_api(self):
        admin = self.users['administrador']
        self.client.force_login(admin)
        self.assertEqual(self.post_json('api_hoja_vida_detail', {'is_active': False}, [admin.pk]).status_code, 400)
        admin.refresh_from_db()
        self.assertTrue(admin.is_active)

    def test_medical_data_is_not_exposed_in_any_case_api_to_other_roles(self):
        case = self.make_case()
        for role in ('tesoreria', 'juridica'):
            self.client.force_login(self.users[role])
            responses = [self.client.get(reverse('api_dashboard')),
                         self.client.get(reverse('api_case_module', args=['incapacidad'])),
                         self.client.get(reverse('api_case_detail', args=[case.pk]))]
            for response in responses:
                self.assertEqual(response.status_code, 200)
                self.assertNotIn('Observación médica privada', response.content.decode())
                self.assertNotIn('Entidad privada', response.content.decode())

    def test_rejected_case_does_not_complete_unperformed_stages(self):
        case = self.make_case('rechazado')
        services.audit(case, self.users['solicitante'], 'Etapa completada', before='borrador', after='revision')
        self.client.force_login(case.owner)
        data = self.client.get(reverse('api_case_detail', args=[case.pk])).json()['data']
        self.assertEqual([step['key'] for step in data['steps'] if step['done']], ['borrador'])
        self.assertLess(data['progress'], 100)
        self.assertFalse(any(step['current'] for step in data['steps']))

    def test_return_marks_previous_stage_as_requiring_correction(self):
        case = self.make_case('correccion')
        case.return_to = 'revision'
        case.save(update_fields=['return_to'])
        services.audit(case, case.owner, 'Etapa completada', before='borrador', after='revision')
        services.audit(case, self.users['talento'], 'Devuelto para corrección', before='revision', after='correccion')
        self.client.force_login(case.owner)
        data = self.client.get(reverse('api_case_detail', args=[case.pk])).json()['data']
        self.assertFalse(any(step['done'] for step in data['steps']))
        self.assertEqual([step['key'] for step in data['steps'] if step['current']], ['borrador'])

    def test_case_history_separates_acts_from_access_and_uses_labels(self):
        case = self.make_case()
        services.audit(case, case.owner, 'Etapa completada', before='borrador', after='revision')
        self.client.force_login(case.owner)
        endpoint = reverse('api_case_detail', args=[case.pk])
        data = self.client.get(endpoint).json()['data']
        self.assertNotIn('Expediente consultado', [event['action'] for event in data['events']['items']])
        transition = data['events']['items'][0]
        self.assertNotEqual(transition['after'], 'revision')
        all_data = self.client.get(endpoint, {'history': 'all'}).json()['data']
        self.assertIn('Expediente consultado', [event['action'] for event in all_data['events']['items']])

    def test_vacation_preview_uses_institutional_holidays_and_rejects_invalid_days(self):
        vacations.load_holidays(2026)
        Holiday.objects.create(date=date(2026, 11, 11), name='Festivo exclusivo de prueba')
        self.client.force_login(self.users['solicitante'])
        endpoint = reverse('api_vacation_preview')
        data = self.client.get(endpoint, {'start': '2026-11-10', 'days': '2'}).json()['data']
        self.assertEqual(data, {'end': '2026-11-12', 'return_date': '2026-11-13'})
        for days in ('0', '100000', 'invalid'):
            self.assertEqual(self.client.get(endpoint, {'start': '2026-11-10', 'days': days}).status_code, 400)

    def test_invalid_json_body_is_reported_as_validation_error(self):
        self.client.force_login(self.users['administrador'])
        self.assertEqual(self.post_json('api_users', []).status_code, 400)
