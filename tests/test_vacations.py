from datetime import date, timedelta
from django.contrib.auth.models import Group, User
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import Client, TestCase
from django.urls import reverse
from django.utils import timezone
from core import services, vacations
from core.access import visible_cases
from core.models import Case, Dependencia, Holiday, PolicyVersion, Profile, VacationPeriod
from core.workflows import validate_config, actor_for

# Calendario oficial de referencia (generado con la librería «holidays» 0.108, no incluida en el proyecto).
OFFICIAL = {
    2025: ['2025-01-01', '2025-01-06', '2025-03-24', '2025-04-17', '2025-04-18', '2025-05-01', '2025-06-02', '2025-06-23', '2025-06-30', '2025-07-20', '2025-08-07', '2025-08-18', '2025-10-13', '2025-11-03', '2025-11-17', '2025-12-08', '2025-12-25'],
    2026: ['2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03', '2026-05-01', '2026-05-18', '2026-06-08', '2026-06-15', '2026-06-29', '2026-07-13', '2026-07-20', '2026-08-07', '2026-08-17', '2026-10-12', '2026-11-02', '2026-11-16', '2026-12-08', '2026-12-25'],
    2027: ['2027-01-01', '2027-01-11', '2027-03-22', '2027-03-25', '2027-03-26', '2027-05-01', '2027-05-10', '2027-05-31', '2027-06-07', '2027-07-05', '2027-07-12', '2027-07-20', '2027-08-07', '2027-08-16', '2027-10-18', '2027-11-01', '2027-11-15', '2027-12-08', '2027-12-25'],
}


class HolidayAndBusinessDayTests(TestCase):
    def test_colombian_holidays_match_official_calendar(self):
        for year, expected in OFFICIAL.items():
            self.assertEqual([d.isoformat() for d, _ in vacations.colombian_holidays(year)], expected, year)

    def test_business_days_discount_holidays_unlike_current_excel(self):
        vacations.load_holidays(2026)
        vacations.load_holidays(2027)
        # Filas del formato 2026: el Excel termina el 19-ene, el 23-nov y el 28-ago por no descontar festivos.
        self.assertEqual(vacations.add_business_days(date(2026, 12, 30), 15), date(2027, 1, 21))
        self.assertEqual(vacations.add_business_days(date(2026, 11, 3), 15), date(2026, 11, 24))
        self.assertEqual(vacations.add_business_days(date(2026, 8, 10), 15), date(2026, 8, 31))
        self.assertEqual(vacations.count_business_days(date(2026, 12, 29), date(2027, 1, 11)), 8)
        self.assertEqual(vacations.next_business_day(date(2027, 1, 21)), date(2027, 1, 22))
        with self.assertRaisesMessage(ValidationError, 'día hábil'):
            vacations.add_business_days(date(2026, 10, 25), 15)  # domingo
        with self.assertRaisesMessage(ValidationError, 'día hábil'):
            vacations.add_business_days(date(2026, 11, 16), 5)  # festivo

    def test_missing_holiday_year_blocks_calculation(self):
        with self.assertRaisesMessage(ValidationError, 'No hay festivos registrados para 2031'):
            vacations.add_business_days(date(2031, 3, 3), 5)

    def test_load_command_is_idempotent_and_keeps_manual_edits(self):
        call_command('cargar_festivos', '2030', stdout=open('nul' if __import__('os').name == 'nt' else '/dev/null', 'w'))
        self.assertEqual(Holiday.objects.filter(date__year=2030).count(), 18)
        Holiday.objects.filter(date=date(2030, 12, 25)).update(name='Navidad (editado)')
        self.assertEqual(vacations.load_holidays(2030), 0)
        self.assertEqual(Holiday.objects.get(date=date(2030, 12, 25)).name, 'Navidad (editado)')


class VacationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        today = timezone.localdate()
        for year in range(today.year - 2, today.year + 2):
            vacations.load_holidays(year)
        for kind in ['vacaciones', 'incapacidad']:
            PolicyVersion.objects.create(kind=kind, version=1, confirmed=True, source='Fuente de prueba', source_pages='1', approval_reference='Prueba', config={})
        cls.fiscal = Dependencia.objects.create(name='Control Fiscal')
        cls.archivo = Dependencia.objects.create(name='Archivo')
        cls.people = {}

        def person(username, dependencia=None, roles=(), hire_years=3, employment='funcionario'):
            user = User.objects.create_user(username, password='Una-clave-segura-2026', first_name=username.title())
            hire = today - timedelta(days=365 * hire_years + 40) if hire_years else None
            Profile.objects.create(user=user, department=(dependencia or cls.fiscal).name, dependencia=dependencia or cls.fiscal, employment=employment, hire_date=hire)
            for role in roles:
                user.groups.add(Group.objects.get_or_create(name=role)[0])
            cls.people[username] = user
            return user

        person('servidor', roles=['solicitante'])
        cls.fiscal.jefe = person('jefe', roles=['solicitante'])
        cls.fiscal.save()
        cls.archivo.jefe = person('jefe_archivo', cls.archivo)
        cls.archivo.save()
        person('talento', roles=['talento'])
        person('autoridad', roles=['autoridad'])
        person('contratista', employment='contratista')
        person('sin_ingreso', hire_years=0)

    def business_day(self, offset):
        day = timezone.localdate() + timedelta(days=offset)
        holidays = vacations.holidays_between(day, day + timedelta(days=15))
        while not vacations.is_business_day(day, holidays):
            day += timedelta(days=1)
        return day

    def refresh(self, case):
        case.refresh_from_db()
        return case

    def request(self, user=None, start=None, days=15):
        return services.create_case(user or self.people['servidor'], 'vacaciones', {'start_date': start or self.business_day(30), 'business_days': days})

    def attach(self, case, category, user):
        self.refresh(case)
        content = f'%PDF-1.4\n{category} {case.documents.count()} {case.revision}\n%%EOF'.encode()
        doc = services.upload(user, case.pk, case.revision, category, SimpleUploadedFile(category + '.pdf', content))
        self.refresh(case)
        return doc

    def advance(self, case, user, **values):
        self.refresh(case)
        if values:
            services.save_data(user, case.pk, case.revision, values)
            self.refresh(case)
        services.transition(user, case.pk, case.revision, 'advance', 'Verificado en prueba')
        return self.refresh(case)

    def grant(self, case):
        """Lleva una solicitud hasta la etapa de disfrute (días ya descontados)."""
        start = date.fromisoformat(case.data['start_date'])
        superior = self.people['autoridad'] if case.owner == self.people['jefe'] else self.people['jefe']
        self.advance(case, case.owner)
        self.advance(case, superior, jefe_note='Aprobado; el área queda cubierta.')
        self.advance(case, self.people['talento'], review_note='Saldo y cruces verificados.')
        self.refresh(case)
        services.save_data(self.people['autoridad'], case.pk, case.revision, {'resolution_number': 'RES-VAC-1', 'resolution_date': min(start - timedelta(days=5), timezone.localdate())})
        self.attach(case, 'acto_firmado', self.people['autoridad'])
        return self.advance(case, self.people['autoridad'])

    def test_periods_follow_hire_date_and_leap_day(self):
        employee = self.people['servidor']
        Profile.objects.filter(user=employee).update(hire_date=date(2022, 3, 15))
        employee.refresh_from_db()
        periods = vacations.sync_periods(employee, today=date(2026, 11, 7))
        self.assertEqual([(p.number, p.service_from, p.service_to) for p in periods], [
            (1, date(2022, 3, 15), date(2023, 3, 14)), (2, date(2023, 3, 15), date(2024, 3, 14)),
            (3, date(2024, 3, 15), date(2025, 3, 14)), (4, date(2025, 3, 15), date(2026, 3, 14))])
        self.assertTrue(all(p.entitled_days == 15 for p in periods))
        self.assertEqual(vacations.add_years(date(2020, 2, 29), 1), date(2021, 3, 1))

    def test_only_officials_with_hire_date_can_request(self):
        with self.assertRaisesMessage(ValidationError, 'contratistas'):
            self.request(self.people['contratista'])
        with self.assertRaisesMessage(ValidationError, 'fecha de ingreso'):
            self.request(self.people['sin_ingreso'])
        with self.assertRaisesMessage(ValidationError, 'entre 1 y 15'):
            self.request(days=16)

    def test_complete_flow_with_superior_talento_and_authority(self):
        start = self.business_day(-40)
        case = self.request(start=start)
        self.assertEqual(case.data['end_date'], vacations.add_business_days(start, 15).isoformat())
        self.assertEqual(case.data['period_label'][:10], 'Periodo 1 ')
        self.advance(case, case.owner)
        self.assertEqual(case.stage, 'visto_bueno')
        for intruder in ['jefe_archivo', 'talento', 'servidor']:
            self.assertFalse(actor_for(self.people[intruder], case), intruder)
            with self.assertRaises(PermissionDenied):
                services.transition(self.people[intruder], case.pk, case.revision, 'advance')
        self.advance(case, self.people['jefe'], jefe_note='Visto bueno.')
        self.advance(case, self.people['talento'], review_note='Saldo suficiente, sin cruces.')
        self.assertEqual(case.stage, 'autorizacion')
        services.save_data(self.people['autoridad'], case.pk, case.revision, {'resolution_number': 'RES-1', 'resolution_date': start - timedelta(days=3)})
        self.attach(case, 'acto_firmado', self.people['autoridad'])
        self.advance(case, self.people['autoridad'])
        self.assertEqual(case.stage, 'disfrute')
        period = VacationPeriod.objects.get(pk=case.data['period_id'])
        self.assertEqual(vacations.period_balance(period), 0)
        self.assertEqual(case.vacation_entries.get().days, 15)
        with self.assertRaisesMessage(ValidationError, 'ya fueron concedidas'):
            services.transition(self.people['talento'], case.pk, case.revision, 'return', 'Corregir fechas')
        with self.assertRaisesMessage(ValidationError, 'anterior a la fecha prevista'):
            self.advance(case, self.people['talento'], actual_return_date=start + timedelta(days=1))
        self.advance(case, self.people['talento'], actual_return_date=date.fromisoformat(case.data['return_date']))
        self.assertEqual(case.stage, 'cerrado')
        self.assertTrue(case.events.filter(action='Vacaciones concedidas y descontadas').exists())

    def test_oldest_period_first_and_open_requests_reserve_days(self):
        services.register_initial_vacation_days(self.people['talento'], self.people['servidor'], 1, 10, 'Resolución 045 de 2024')
        with self.assertRaisesMessage(ValidationError, 'tiene 5 días hábiles disponibles'):
            self.request(days=15)
        first = self.request(days=5)
        self.assertTrue(first.data['period_label'].startswith('Periodo 1 '))
        second = self.request(start=self.business_day(60), days=15)
        self.assertTrue(second.data['period_label'].startswith('Periodo 2 '))
        with self.assertRaises(PermissionDenied):
            services.register_initial_vacation_days(self.people['jefe'], self.people['servidor'], 2, 3, 'Sin rol')

    def test_conflicts_with_other_absences(self):
        start = self.business_day(30)
        services.create_case(self.people['servidor'], 'incapacidad', {'start_date': start + timedelta(days=2), 'end_date': start + timedelta(days=4), 'leave_type': 'comun', 'entity': 'EPS'})
        with self.assertRaisesMessage(ValidationError, 'se cruzan con una incapacidad'):
            self.request(start=start)
        self.request(start=self.business_day(60))
        with self.assertRaisesMessage(ValidationError, 'se cruzan con otras vacaciones'):
            self.request(start=self.business_day(62), days=5)

    def suspend(self, case, on_date, user=None, acto='RES-SUSP-1', acto_fecha=None, reason='Necesidad del servicio'):
        doc = self.attach(case, 'novedad_vacaciones', self.people['talento'])
        services.interrupt_vacation(user or self.people['talento'], case.pk, case.revision, 'suspension', on_date, reason, doc.pk, acto, acto_fecha or timezone.localdate())
        return self.refresh(case)

    def test_first_trip_of_each_period_is_at_least_five_business_days(self):
        with self.assertRaisesMessage(ValidationError, 'primera salida de vacaciones de cada periodo debe ser de al menos 5'):
            self.request(days=3)
        self.request(days=5)
        # Con días ya tomados antes del sistema, ya no es la primera salida: se permiten salidas cortas.
        services.register_initial_vacation_days(self.people['talento'], self.people['jefe'], 1, 10, 'Hoja de vida')
        corta = self.request(self.people['jefe'], days=3)
        self.assertEqual(corta.data['business_days'], 3)

    def test_suspension_only_after_five_days_enjoyed_and_with_resolution(self):
        start = self.business_day(-25)
        case = self.grant(self.request(start=start))
        minima = vacations.fecha_minima_suspension(case)
        self.assertEqual(vacations.count_business_days(start, minima - timedelta(days=1)), 5)
        with self.assertRaisesMessage(ValidationError, 'después de disfrutar al menos 5 días hábiles'):
            self.suspend(case, start + timedelta(days=1))
        with self.assertRaisesMessage(ValidationError, 'única novedad de vacaciones es la suspensión'):
            services.interrupt_vacation(self.people['talento'], case.pk, case.revision, 'aplazamiento', minima, 'x', 1, 'R', timezone.localdate())
        with self.assertRaisesMessage(ValidationError, 'número de la resolución'):
            self.suspend(case, minima, acto='')
        with self.assertRaises(PermissionDenied):
            self.suspend(case, minima, user=self.people['jefe'])
        case = self.suspend(case, minima, acto='Resolución 045', reason='Incapacidad médica durante el disfrute')
        self.assertEqual(case.data['enjoyed_days'], 5)
        self.assertEqual(case.data['returned_days'], 10)
        self.assertEqual(case.data['interruption_act_number'], 'Resolución 045')
        self.assertEqual(case.data['planned_end_date'], vacations.add_business_days(start, 15).isoformat())
        period = VacationPeriod.objects.get(pk=case.data['period_id'])
        self.assertEqual(vacations.period_balance(period), 10)
        with self.assertRaisesMessage(PermissionDenied, 'una vez por cada salida'):
            self.suspend(case, minima)
        self.advance(case, self.people['talento'], actual_return_date=minima)
        self.assertEqual(case.stage, 'cerrado')

    def test_future_vacations_cannot_be_suspended(self):
        case = self.grant(self.request(start=self.business_day(20)))
        self.assertFalse(services.can_interrupt_vacation(self.people['talento'], case))

    def test_suspend_more_than_once_and_history_shows_what_is_left(self):
        start = self.business_day(-40)
        first = self.grant(self.request(start=start))
        first = self.suspend(first, vacations.fecha_minima_suspension(first), acto='Resolución 010')
        self.advance(first, self.people['talento'], actual_return_date=date.fromisoformat(first.data['return_date']))
        # Retoma 8 de los 10 días pendientes y la vuelve a suspender al segundo día: ya lleva 5 del periodo.
        restart = self.business_day(-14)
        second = self.grant(self.request(start=restart, days=8))
        self.assertTrue(services.can_interrupt_vacation(self.people['talento'], second))
        second = self.suspend(second, vacations.fecha_minima_suspension(second), acto='Resolución 020')
        period = VacationPeriod.objects.get(pk=first.data['period_id'])
        self.assertEqual(vacations.period_balance(period), 15 - 5 - second.data['enjoyed_days'])
        hist = next(p for p in vacations.historial(self.people['servidor']) if p['numero'] == period.number)
        self.assertEqual(hist['pendientes'], vacations.period_balance(period))
        self.assertEqual([e['acto_numero'] for e in hist['eventos'] if e['tipo'] == 'suspension'], ['Resolución 010', 'Resolución 020'])
        self.assertEqual(hist['plazo'], (vacations.add_years(start, 1) - timedelta(days=1)).isoformat())
        self.assertEqual([e['tipo'] for e in hist['eventos']], ['salida', 'suspension', 'salida', 'suspension'])

    def test_history_permissions_and_one_step_upload_via_api(self):
        start = self.business_day(-25)
        case = self.grant(self.request(start=start))
        client = Client()
        client.force_login(self.people['talento'])
        minima = vacations.fecha_minima_suspension(case)
        archivo = SimpleUploadedFile('resolucion.pdf', b'%PDF-1.4\nresolucion de suspension\n%%EOF')
        # Si la suspensión no procede, la resolución tampoco queda guardada.
        res = client.post(reverse('api_case_vacation_interruption', args=[case.pk]), {'revision': case.revision, 'on_date': (start + timedelta(days=1)).isoformat(), 'acto_numero': 'Resolución 099', 'acto_fecha': timezone.localdate().isoformat(), 'reason': 'Necesidad del servicio', 'file': archivo})
        self.assertEqual(res.status_code, 400)
        self.assertFalse(case.documents.filter(category='novedad_vacaciones').exists())
        archivo.seek(0)
        res = client.post(reverse('api_case_vacation_interruption', args=[case.pk]), {'revision': case.revision, 'on_date': minima.isoformat(), 'acto_numero': 'Resolución 099', 'acto_fecha': timezone.localdate().isoformat(), 'reason': 'Necesidad del servicio', 'file': archivo})
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(case.documents.filter(category='novedad_vacaciones').count(), 1)
        url = reverse('api_vacation_history', args=[self.people['servidor'].pk])
        eventos = [e for periodo in client.get(url).json()['data']['periodos'] for e in periodo['eventos']]
        self.assertIn('Resolución 099', [e.get('acto_numero') for e in eventos])
        for username, status in [('servidor', 200), ('jefe', 200), ('jefe_archivo', 403)]:
            other = Client()
            other.force_login(self.people[username])
            self.assertEqual(other.get(url).status_code, status, username)

    def test_deadline_alert_one_year_after_first_day(self):
        start = self.business_day(-380)
        case = self.grant(self.request(start=start))
        self.suspend(case, vacations.fecha_minima_suspension(case))
        labels = [a['label'] for a in vacations.alerts(self.people['talento'], [])]
        self.assertTrue(any('se venció el plazo para tomarlos' in label for label in labels), labels)

    def test_superior_visibility_and_self_approval(self):
        team_case = self.request()
        services.transition(team_case.owner, team_case.pk, team_case.revision, 'advance')
        incapacity = services.create_case(self.people['servidor'], 'incapacidad', {'start_date': self.business_day(90), 'end_date': self.business_day(90), 'leave_type': 'comun', 'entity': 'EPS'})
        Case.objects.filter(pk=incapacity.pk).update(stage='revision')
        jefe_cases = set(visible_cases(self.people['jefe']).values_list('pk', flat=True))
        self.assertIn(team_case.pk, jefe_cases)
        self.assertNotIn(incapacity.pk, jefe_cases)
        self.assertNotIn(team_case.pk, set(visible_cases(self.people['jefe_archivo']).values_list('pk', flat=True)))
        own = self.request(self.people['jefe'])
        services.transition(own.owner, own.pk, own.revision, 'advance')
        own = self.refresh(own)
        self.assertFalse(actor_for(self.people['jefe'], own))
        self.assertTrue(actor_for(self.people['autoridad'], own))

    def test_reminders_for_owner_superior_and_talento(self):
        case = self.grant(self.request(start=self.business_day(5)))
        cases = list(Case.objects.filter(pk=case.pk).select_related('owner'))
        for username in ['servidor', 'jefe', 'talento']:
            labels = [a['label'] for a in vacations.alerts(self.people[username], cases)]
            self.assertTrue(any('inician en' in label for label in labels), (username, labels))
        self.assertFalse(any('inician en' in a['label'] for a in vacations.alerts(self.people['jefe_archivo'], cases)))
        talento_labels = [a['label'] for a in vacations.alerts(self.people['talento'], [])]
        self.assertTrue(any('periodos de vacaciones acumulados' in label for label in talento_labels), talento_labels)

    def test_config_keeps_superior_stage_relational(self):
        validate_config('vacaciones', {'roles': {'visto_bueno': ['jefe'], 'revision': ['talento', 'secretaria']}})
        with self.assertRaises(ValidationError):
            validate_config('vacaciones', {'roles': {'visto_bueno': ['talento']}})
        with self.assertRaises(ValidationError):
            validate_config('vacaciones', {'roles': {'revision': ['jefe']}})

    def test_pages_render_and_admin_registers_employment_data(self):
        case = self.grant(self.request(start=self.business_day(5)))
        for username in ['servidor', 'jefe', 'talento', 'autoridad']:
            client = Client()
            client.force_login(self.people[username])
            for url in [reverse('dashboard'), reverse('case_list', args=['vacaciones']), reverse('case_create', args=['vacaciones']), reverse('case_detail', args=[case.pk]), reverse('procedure')]:
                response = client.get(url)
                self.assertEqual(response.status_code, 200, (username, url))
            report = client.get(reverse('report', args=['vacaciones']))
            self.assertIn('Periodo de causación', report.content.decode('utf-8'))
        client = Client()
        client.force_login(self.people['talento'])
        detail = client.get(reverse('case_detail', args=[case.pk]))
        self.assertContains(detail, 'Saldo de vacaciones')
        self.assertNotContains(detail, 'aplazamiento')
        admin = User.objects.create_user('admin', password='Una-clave-segura-2026')
        Profile.objects.create(user=admin, department='Sistemas')
        admin.groups.add(Group.objects.get_or_create(name='administrador')[0])
        client.force_login(admin)
        response = client.post(reverse('users'), {'name': 'Nueva Jefa', 'username': 'nueva', 'department': 'responsabilidad fiscal', 'password': 'Nueva-frase-segura-2026', 'password_confirm': 'Nueva-frase-segura-2026', 'roles': ['solicitante'], 'employment': 'funcionario', 'cedula': '1085000111', 'cargo': 'Profesional Universitario', 'codigo': '219', 'grado': '1', 'hire_date': '2020-02-03', 'is_jefe': 'on'})
        self.assertEqual(response.status_code, 302)
        new = User.objects.get(username='nueva')
        self.assertEqual(new.profile.dependencia.jefe, new)
        self.assertEqual(new.profile.hire_date, date(2020, 2, 3))
        response = client.post(reverse('users'), {'name': 'Duplicada', 'username': 'dup', 'department': 'Archivo', 'password': 'Nueva-frase-segura-2026', 'password_confirm': 'Nueva-frase-segura-2026', 'roles': ['solicitante'], 'employment': 'funcionario', 'cedula': '1085000111'})
        self.assertContains(response, 'ya tiene registrada esa cédula')
        response = client.post(reverse('user_access', args=[new.pk]), {'roles': ['solicitante'], 'active': 'on', 'password': '', 'department': 'Responsabilidad Fiscal', 'employment': 'funcionario', 'cedula': '1085000111', 'hire_date': '2020-02-03'})
        self.assertEqual(response.status_code, 302)
        self.assertIsNone(Dependencia.objects.get(name__iexact='responsabilidad fiscal').jefe)
