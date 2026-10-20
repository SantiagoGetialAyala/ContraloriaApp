import os
import sqlite3
from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

class Command(BaseCommand):
    help = 'Crea una copia SQLite consistente, incluidos documentos y auditoría, en var/backups.'
    def handle(self, *args, **options):
        folder = settings.DATA_DIR / 'backups'
        folder.mkdir(mode=0o700, exist_ok=True)
        destination = folder / ('talento-' + timezone.now().strftime('%Y%m%d-%H%M%S-%f') + '.sqlite3')
        fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.close(fd)
        with sqlite3.connect(settings.DATABASES['default']['NAME']) as source, sqlite3.connect(destination) as target:
            source.backup(target)
        self.stdout.write(self.style.SUCCESS(f'Copia consistente creada: {destination}'))
