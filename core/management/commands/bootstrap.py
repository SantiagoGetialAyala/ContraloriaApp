from getpass import getpass
from django.contrib.auth.models import User, Group
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from core.forms import SetupForm
from core.models import Profile
from core.services import apply_profile, audit

class Command(BaseCommand):
    help = 'Crea interactivamente el primer administrador, sin contraseña predefinida.'
    def handle(self, *args, **options):
        if User.objects.exists():
            raise CommandError('Ya existe un usuario. Use la administración de accesos.')
        form = SetupForm({'name': input('Nombre completo: '), 'username': input('Usuario: '), 'department': input('Dependencia: '), 'password': getpass('Contraseña: '), 'password_confirm': getpass('Repita contraseña: ')})
        if not form.is_valid():
            raise CommandError(str(form.errors.as_text()))
        with transaction.atomic():
            if User.objects.exists():
                raise CommandError('La configuración inicial ya fue realizada.')
            d = form.cleaned_data
            user = User.objects.create_user(d['username'], password=d['password'], first_name=d['name'])
            apply_profile(Profile(user=user), d)
            user.groups.add(Group.objects.get_or_create(name='administrador')[0])
            audit(None, user, 'Administrador inicial creado por consola')
        self.stdout.write(self.style.SUCCESS('Administrador creado.'))
