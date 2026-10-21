import uuid
from django.conf import settings
from django.db import models
from django.db.models import Q

KINDS = [
    ('incapacidad', 'Incapacidades'),
    ('viatico', 'Viáticos'),
    ('compensatorio', 'Gestión de compensatorios'),
]
ROLES = [('solicitante', 'Funcionario / solicitante'), ('talento', 'Talento Humano'), ('juridica', 'Asesoría Jurídica'), ('tesoreria', 'Tesorería'), ('contabilidad', 'Contabilidad'), ('presupuesto', 'Presupuesto'), ('secretaria', 'Secretaría de Despacho'), ('autoridad', 'Contralor / autoridad competente'), ('control', 'Control Interno'), ('administrador', 'Administrador del sistema')]

class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='profile')
    department = models.CharField(max_length=160)
    employment = models.CharField(max_length=20, choices=[('funcionario', 'Funcionario'), ('contratista', 'Contratista')], default='funcionario')

class PolicyVersion(models.Model):
    kind = models.CharField(max_length=20, choices=KINDS)
    version = models.PositiveIntegerField()
    source = models.TextField(blank=True)
    source_pages = models.CharField(max_length=200, blank=True)
    approval_reference = models.CharField(max_length=200, blank=True)
    confirmed = models.BooleanField(default=False)
    config = models.JSONField(default=dict)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        constraints = [models.UniqueConstraint(fields=['kind', 'version'], name='policy_version_unique')]
        ordering = ['-version']

class TravelScale(models.Model):
    name = models.CharField(max_length=160)
    category = models.CharField(max_length=100)
    destination = models.CharField(max_length=100)
    valid_from = models.DateField()
    valid_until = models.DateField()
    overnight_rate = models.DecimalField(max_digits=16, decimal_places=2)
    day_rate = models.DecimalField(max_digits=16, decimal_places=2)
    source = models.TextField()
    approval_reference = models.CharField(max_length=200)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        constraints = [models.CheckConstraint(condition=Q(valid_until__gte=models.F('valid_from')), name='scale_dates'), models.CheckConstraint(condition=Q(overnight_rate__gte=0) & Q(day_rate__gte=0), name='scale_nonnegative')]
        ordering = ['-created_at']
    def __str__(self):
        return f'{self.name} · {self.category} · {self.destination} ({self.valid_from} / {self.valid_until})'

class Case(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=20, choices=KINDS)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='cases')
    department = models.CharField(max_length=160)
    policy = models.ForeignKey(PolicyVersion, on_delete=models.PROTECT)
    stage = models.CharField(max_length=60, default='borrador')
    return_to = models.CharField(max_length=60, blank=True)
    correction_fields = models.TextField(blank=True)
    data = models.JSONField(default=dict)
    revision = models.PositiveIntegerField(default=1)
    due_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        ordering = ['-updated_at']
        indexes = [models.Index(fields=['kind', 'stage']), models.Index(fields=['owner', 'created_at'])]
    @property
    def reference(self):
        prefixes = {'incapacidad': 'INC', 'viatico': 'VIA', 'compensatorio': 'COM'}
        return prefixes.get(self.kind, 'EXP') + '-' + str(self.id)[:8].upper()

class Document(models.Model):
    case = models.ForeignKey(Case, on_delete=models.PROTECT, related_name='documents')
    category = models.CharField(max_length=80)
    name = models.CharField(max_length=200)
    content_type = models.CharField(max_length=100)
    content = models.BinaryField()
    sha256 = models.CharField(max_length=64)
    size = models.PositiveIntegerField()
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ['-created_at']

class FinancialEntry(models.Model):
    case = models.ForeignKey(Case, on_delete=models.PROTECT, related_name='financial_entries')
    kind = models.CharField(max_length=30, choices=[('recuperacion', 'Recuperación de recobro'), ('desembolso', 'Desembolso de viáticos'), ('reintegro', 'Reintegro de viáticos')])
    amount = models.DecimalField(max_digits=16, decimal_places=2)
    paid_on = models.DateField()
    reference = models.CharField(max_length=160)
    evidence = models.ForeignKey(Document, on_delete=models.PROTECT)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        constraints = [models.CheckConstraint(condition=Q(amount__gt=0), name='entry_positive'), models.UniqueConstraint(fields=['case', 'kind', 'reference'], name='unique_payment_reference')]
        ordering = ['created_at']


class CompensatoryLedgerEntry(models.Model):
    """Immutable minute ledger; entries only arise from explicit authorized transitions."""

    employee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='compensatory_ledger')
    case = models.ForeignKey(Case, on_delete=models.PROTECT, related_name='compensatory_entries')
    kind = models.CharField(max_length=10, choices=[('credito', 'Tiempo reconocido'), ('debito', 'Compensatorio autorizado')])
    minutes = models.PositiveIntegerField()
    effective_on = models.DateField()
    rule_reference = models.CharField(max_length=200)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='authorized_compensatory_entries')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(minutes__gt=0), name='compensatory_minutes_positive'),
            models.UniqueConstraint(fields=['case', 'kind'], name='unique_compensatory_entry_per_case_kind'),
        ]
        ordering = ['effective_on', 'created_at', 'id']

class Event(models.Model):
    case = models.ForeignKey(Case, on_delete=models.PROTECT, related_name='events', null=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)
    action = models.CharField(max_length=100)
    before = models.CharField(max_length=60, blank=True)
    after = models.CharField(max_length=60, blank=True)
    note = models.TextField(blank=True)
    details = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ['created_at', 'id']

class LoginAttempt(models.Model):
    key = models.CharField(max_length=64, unique=True)
    failures = models.PositiveIntegerField(default=0)
    last_attempt = models.DateTimeField()
