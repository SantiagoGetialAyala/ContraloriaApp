import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_vacaciones'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='profile',
            name='phone',
            field=models.CharField(blank=True, max_length=40),
        ),
        migrations.AddField(
            model_name='profile',
            name='institutional_email',
            field=models.EmailField(blank=True, max_length=160),
        ),
        migrations.AddField(
            model_name='profile',
            name='profession',
            field=models.CharField(blank=True, max_length=160),
        ),
        migrations.AddField(
            model_name='profile',
            name='bio',
            field=models.TextField(blank=True),
        ),
        migrations.CreateModel(
            name='EmployeeDocument',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('category', models.CharField(choices=[('hoja_vida', 'Hoja de vida (Formato Único / CV)'), ('documento_identidad', 'Documento de identidad / Cédula'), ('diploma_acta', 'Título académico / Diploma / Acta de grado'), ('tarjeta_profesional', 'Tarjeta profesional'), ('certificacion_laboral', 'Certificación de experiencia laboral'), ('contrato_posesion', 'Contrato / Acto de nombramiento y posesión'), ('antecedentes', 'Certificados de antecedentes (Procuraduría, Contraloría, Policía)'), ('examen_medico', 'Examen médico ocupacional'), ('rut_bancario', 'RUT / Certificación bancaria'), ('otro_soporte', 'Otro documento o soporte de hoja de vida')], default='hoja_vida', max_length=50)),
                ('title', models.CharField(blank=True, max_length=200)),
                ('notes', models.TextField(blank=True)),
                ('name', models.CharField(max_length=200)),
                ('content_type', models.CharField(max_length=100)),
                ('content', models.BinaryField()),
                ('sha256', models.CharField(max_length=64)),
                ('size', models.PositiveIntegerField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('employee', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='employee_documents', to=settings.AUTH_USER_MODEL)),
                ('uploaded_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='uploaded_employee_documents', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at', '-id'],
            },
        ),
    ]
