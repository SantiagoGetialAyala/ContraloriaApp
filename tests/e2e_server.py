"""Servidor exclusivo de Playwright. Nunca utiliza var/ ni var-demo/."""
import os
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

if os.environ.get('TALENTO_E2E') != '1':
    raise RuntimeError('Este servidor solo se ejecuta desde la configuración de pruebas E2E.')
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ['TALENTO_DATA_DIR'] = tempfile.mkdtemp(prefix='contraloria-e2e-')
os.environ['DJANGO_SETTINGS_MODULE'] = 'talento.settings'

import django
django.setup()
from django.core.management import call_command
from django.contrib.auth.models import Group, User
from django.utils import timezone
from core import services, vacations
from core.models import Case, PolicyVersion, Profile
from core.workflows import WORKFLOWS

call_command('migrate', verbosity=0)
people = {}
for username, role, name in [('admin.e2e', 'administrador', 'Administración de prueba'),
                             ('persona.e2e', 'solicitante', 'Funcionario de prueba'),
                             ('talento.e2e', 'talento', 'Talento de prueba')]:
    user = User.objects.create_user(username, password='Pruebas-interfaz-2026', first_name=name)
    user.groups.add(Group.objects.get_or_create(name=role)[0])
    services.apply_profile(Profile(user=user), {'department': 'Dependencia de prueba', 'hire_date': date(2023, 1, 1), 'employment': 'funcionario'})
    people[role] = user
for kind in WORKFLOWS:
    PolicyVersion.objects.create(kind=kind, version=1, confirmed=False, config={})
today = timezone.localdate()
for year in (today.year, today.year + 1):
    vacations.load_holidays(year)
case = Case.objects.create(kind='incapacidad', stage='borrador', owner=people['solicitante'],
    department='Dependencia de prueba', policy=PolicyVersion.objects.get(kind='incapacidad'),
    data={'start_date': (today - timedelta(days=4)).isoformat(), 'end_date': (today - timedelta(days=3)).isoformat(),
          'entity': 'Entidad de prueba', 'leave_type': 'comun', 'observations': 'Datos exclusivos de E2E'})
services.audit(case, case.owner, 'Borrador creado', after='borrador')
call_command('runserver', '127.0.0.1:8011', '--noreload', verbosity=0)
