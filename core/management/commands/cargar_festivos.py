from django.core.management.base import BaseCommand, CommandError
from core.models import Holiday
from core.vacations import load_holidays


class Command(BaseCommand):
    help = 'Registra los festivos de Colombia de uno o varios años (Ley 51 de 1983). No modifica festivos ya registrados.'

    def add_arguments(self, parser):
        parser.add_argument('years', nargs='+', type=int)

    def handle(self, *args, years, **options):
        for year in years:
            if not 2000 <= year <= 2100:
                raise CommandError(f'Año fuera de rango: {year}')
            created = load_holidays(year)
            total = Holiday.objects.filter(date__year=year).count()
            self.stdout.write(self.style.SUCCESS(f'{year}: {created} festivos nuevos, {total} registrados. Verifíquelos contra el calendario oficial.'))
