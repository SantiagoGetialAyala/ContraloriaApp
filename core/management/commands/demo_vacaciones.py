"""Datos ficticios para probar el módulo de vacaciones en una base SEPARADA.

Uso (PowerShell):
    $env:TALENTO_DATA_DIR = "$PWD\\var-demo"
    python manage.py migrate
    python manage.py demo_vacaciones
    python manage.py runserver 127.0.0.1:8000
"""
from datetime import timedelta
from pathlib import Path
from django.conf import settings
from django.contrib.auth.models import Group, User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from core import services, vacations
from core.models import PolicyVersion, Profile

PASSWORD = 'Demo-vacaciones-2026'
# Nombres y cédulas inventados. Nunca use datos reales de funcionarios en esta base.
PEOPLE = [
    ('admin', 'Administrador Demo', 'Sistemas', ['administrador'], None, False),
    ('talento', 'Teresa Talento', 'Talento Humano', ['talento', 'solicitante'], 6, False),
    ('autoridad', 'Andrés Autoridad', 'Despacho', ['autoridad'], 8, False),
    ('jefe.fiscal', 'Julia Jefe Fiscal', 'Control Fiscal', ['solicitante'], 5, True),
    ('ana', 'Ana Servidora', 'Control Fiscal', ['solicitante'], 3, False),
    ('bruno', 'Bruno Servidor', 'Control Fiscal', ['solicitante'], 2, False),
    ('jefe.archivo', 'Jorge Jefe Archivo', 'Archivo', ['solicitante'], 4, True),
    ('carla', 'Carla Archivo', 'Archivo', ['solicitante'], 1, False),
    ('contratista', 'Camilo Contratista', 'Archivo', ['solicitante'], None, False),
]


def pdf(name):
    return SimpleUploadedFile(name + '.pdf', f'%PDF-1.4\nDocumento ficticio {name} {timezone.now().isoformat()}\n%%EOF'.encode())


class Command(BaseCommand):
    help = 'Crea usuarios y solicitudes FICTICIAS de vacaciones en una base separada (TALENTO_DATA_DIR) para pruebas.'

    def handle(self, *args, **options):
        default_dir = (Path(settings.BASE_DIR) / 'var').resolve()
        if settings.PRODUCTION or Path(settings.DATA_DIR).resolve() == default_dir:
            raise CommandError('Por seguridad, use una base separada: defina TALENTO_DATA_DIR (por ejemplo var-demo) antes de ejecutar este comando.')
        if User.objects.exists():
            raise CommandError('La base de demostración ya tiene usuarios. Borre la carpeta de TALENTO_DATA_DIR y vuelva a migrar.')
        today = timezone.localdate()
        with transaction.atomic():
            for year in range(today.year - 1, today.year + 2):
                vacations.load_holidays(year)
            PolicyVersion.objects.create(kind='vacaciones', version=1, confirmed=True, source='DEMOSTRACIÓN · no es una versión oficial', source_pages='N/A', approval_reference='DEMO', config={})
            users = {}
            for username, name, department, roles, years, is_jefe in PEOPLE:
                user = User.objects.create_user(username, password=PASSWORD, first_name=name)
                hire = today - timedelta(days=365 * years + 45) if years else None
                services.apply_profile(Profile(user=user), {
                    'department': department, 'employment': 'contratista' if username == 'contratista' else 'funcionario',
                    'cedula': str(90000000 + len(users)), 'cargo': 'Profesional Universitario', 'codigo': '219', 'grado': '1',
                    'hire_date': hire, 'is_jefe': is_jefe,
                })
                user.groups.set([Group.objects.get_or_create(name=r)[0] for r in roles])
                users[username] = user
            # Ana ya disfrutó 10 días de su primer periodo antes del sistema: debe programar primero los 5 restantes.
            services.register_initial_vacation_days(users['talento'], users['ana'], 1, 10, 'Saldo ficticio de demostración')
            # Bruno: solicitud esperando el visto bueno de su jefe.
            waiting = services.create_case(users['bruno'], 'vacaciones', {'start_date': self.business_day(today, 25), 'business_days': 15})
            services.transition(users['bruno'], waiting.pk, waiting.revision, 'advance', 'Solicitud enviada')
            # Carla: vacaciones concedidas que inician pronto (genera recordatorios).
            self.granted(users, users['carla'], users['jefe.archivo'], self.business_day(today, 5))
        self.stdout.write(self.style.SUCCESS(f'Base de demostración lista. Contraseña de todos los usuarios: {PASSWORD}'))
        for username, name, department, roles, *_ in PEOPLE:
            self.stdout.write(f'  {username:<13} {name:<22} {department:<15} {", ".join(roles)}')

    def business_day(self, today, offset):
        day = today + timedelta(days=offset)
        holidays = vacations.holidays_between(day, day + timedelta(days=15))
        while not vacations.is_business_day(day, holidays):
            day += timedelta(days=1)
        return day

    def granted(self, users, owner, superior, start):
        case = services.create_case(owner, 'vacaciones', {'start_date': start, 'business_days': 15})
        steps = [(owner, {}), (superior, {'jefe_note': 'Visto bueno (demo).'}), (users['talento'], {'review_note': 'Saldo verificado (demo).'})]
        for actor, values in steps:
            case.refresh_from_db()
            if values:
                services.save_data(actor, case.pk, case.revision, values)
                case.refresh_from_db()
            services.transition(actor, case.pk, case.revision, 'advance', 'Demo')
        case.refresh_from_db()
        services.save_data(users['autoridad'], case.pk, case.revision, {'resolution_number': 'RES-DEMO-001', 'resolution_date': timezone.localdate()})
        case.refresh_from_db()
        services.upload(users['autoridad'], case.pk, case.revision, 'acto_firmado', pdf('resolucion-demo'))
        case.refresh_from_db()
        services.transition(users['autoridad'], case.pk, case.revision, 'advance', 'Demo')
        return case
