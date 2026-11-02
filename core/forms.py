from decimal import Decimal
from django import forms
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from .models import ROLES, Profile, TravelScale, KINDS
from .workflows import FIELDS, DOCS

BASE_FIELDS = {
    'incapacidad': ['start_date', 'end_date', 'leave_type', 'incapacity_number', 'radication_number', 'epicrisis_radication', 'entity', 'observations'],
    'viatico': ['start_date', 'end_date', 'purpose', 'destination', 'category', 'overnight', 'transport', 'observations'],
    'compensatorio': ['work_date', 'work_start', 'work_end', 'break_minutes', 'activity_description', 'observations'],
}

class CaseDataForm(forms.Form):
    revision = forms.IntegerField(widget=forms.HiddenInput)
    def __init__(self, *args, keys, initial_data=None, **kwargs):
        super().__init__(*args, **kwargs)
        for key in keys:
            label, kind, *rest = FIELDS[key]
            common = {'label': label, 'required': False}
            if kind in ('date', 'pastdate'):
                field = forms.DateField(widget=forms.DateInput(attrs={'type': 'date'}), **common)
            elif kind == 'time':
                field = forms.TimeField(widget=forms.TimeInput(attrs={'type': 'time'}), **common)
            elif kind == 'money':
                field = forms.DecimalField(min_value=0, max_value=Decimal('999999999999.99'), max_digits=14, decimal_places=2, widget=forms.NumberInput(attrs={'step': '0.01'}), **common)
            elif kind == 'int':
                field = forms.IntegerField(min_value=0, max_value=3660, **common)
            elif kind == 'bool':
                field = forms.BooleanField(**common)
            elif kind == 'choice':
                field = forms.ChoiceField(choices=[('', 'Seleccione una opción')] + rest[0], **common)
            elif kind == 'scale':
                field = forms.ModelChoiceField(queryset=TravelScale.objects.all(), **common)
            else:
                field = forms.CharField(max_length=5000 if kind == 'textarea' else 200, widget=forms.Textarea(attrs={'rows': 3}) if kind == 'textarea' else forms.TextInput, **common)
            self.fields[key] = field
        if initial_data:
            for key in keys:
                self.fields[key].initial = initial_data.get(key)

class UploadForm(forms.Form):
    revision = forms.IntegerField(widget=forms.HiddenInput)
    category = forms.ChoiceField(label='Tipo de documento')
    file = forms.FileField(label='Archivo PDF, JPG o PNG (máximo 8 MB)')
    def __init__(self, *args, categories, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['category'].choices = [(x, DOCS[x]) for x in sorted(set(categories))]

class DecisionForm(forms.Form):
    revision = forms.IntegerField(widget=forms.HiddenInput)
    action = forms.ChoiceField(choices=[('advance', 'Continuar'), ('return', 'Devolver'), ('reject', 'Rechazar'), ('note', 'Nota')], widget=forms.HiddenInput)
    note = forms.CharField(label='Observaciones de la actuación', max_length=5000, required=False, widget=forms.Textarea(attrs={'rows': 3}))

class PaymentForm(forms.Form):
    revision = forms.IntegerField(widget=forms.HiddenInput)
    kind = forms.ChoiceField(label='Tipo de movimiento')
    amount = forms.DecimalField(label='Valor (COP)', min_value=Decimal('0.01'), max_value=Decimal('999999999999.99'), max_digits=14, decimal_places=2)
    paid_on = forms.DateField(label='Fecha efectiva del movimiento', widget=forms.DateInput(attrs={'type': 'date'}))
    reference = forms.CharField(label='Referencia bancaria / comprobante', max_length=160)
    evidence = forms.ModelChoiceField(label='Soporte previamente adjuntado', queryset=None)
    def __init__(self, *args, case, **kwargs):
        super().__init__(*args, **kwargs)
        kinds = [('recuperacion', 'Recuperación de recobro')] if case.kind == 'incapacidad' else [('desembolso', 'Desembolso de viáticos'), ('reintegro', 'Reintegro de viáticos')]
        self.fields['kind'].choices = kinds
        self.fields['evidence'].queryset = case.documents.filter(category__in=[x[0] for x in kinds]).defer('content')
        self.fields['evidence'].label_from_instance = lambda d: f'{DOCS[d.category]} · {d.name} · {d.created_at:%d/%m/%Y %H:%M}'

class SetupForm(forms.Form):
    name = forms.CharField(label='Nombre completo', max_length=150)
    username = forms.CharField(label='Usuario administrador', max_length=150)
    department = forms.CharField(label='Dependencia', max_length=160)
    password = forms.CharField(label='Contraseña (mínimo 12 caracteres)', widget=forms.PasswordInput)
    password_confirm = forms.CharField(label='Repita la contraseña', widget=forms.PasswordInput)
    def clean(self):
        data = super().clean()
        if data.get('password') != data.get('password_confirm'):
            self.add_error('password_confirm', 'Las contraseñas no coinciden.')
        if data.get('password'):
            validate_password(data['password'], User(username=data.get('username', ''), first_name=data.get('name', '')))
        if data.get('username'):
            try:
                User._meta.get_field('username').run_validators(data['username'])
            except ValidationError as exc:
                self.add_error('username', exc)
        return data

class UserForm(SetupForm):
    roles = forms.MultipleChoiceField(label='Roles autorizados', choices=ROLES, widget=forms.CheckboxSelectMultiple)
    employment = forms.ChoiceField(label='Vinculación', choices=Profile._meta.get_field('employment').choices)
    def clean_username(self):
        value = self.cleaned_data['username']
        if User.objects.filter(username=value).exists():
            raise ValidationError('El usuario ya existe.')
        return value

class UserAccessForm(forms.Form):
    roles = forms.MultipleChoiceField(label='Roles autorizados', choices=ROLES, widget=forms.CheckboxSelectMultiple)
    active = forms.BooleanField(label='Usuario activo', required=False)
    password = forms.CharField(label='Nueva contraseña (opcional)', required=False, widget=forms.PasswordInput)
    def clean_password(self):
        value = self.cleaned_data.get('password')
        if value:
            validate_password(value)
        return value

class ScaleForm(forms.ModelForm):
    class Meta:
        model = TravelScale
        fields = ['name', 'category', 'destination', 'valid_from', 'valid_until', 'overnight_rate', 'day_rate', 'source', 'approval_reference']
        labels = {'name': 'Nombre / versión de la escala', 'category': 'Categoría (debe coincidir con la solicitud)', 'destination': 'Destino (debe coincidir con la solicitud)', 'valid_from': 'Vigente desde', 'valid_until': 'Vigente hasta', 'overnight_rate': 'Tarifa diaria con pernoctación (COP)', 'day_rate': 'Tarifa diaria sin pernoctación (COP)', 'source': 'Fuente normativa y páginas verificadas', 'approval_reference': 'Referencia del acto de aprobación institucional'}
        widgets = {'valid_from': forms.DateInput(attrs={'type': 'date'}), 'valid_until': forms.DateInput(attrs={'type': 'date'}), 'source': forms.Textarea(attrs={'rows': 3})}
    def clean(self):
        data = super().clean()
        if data.get('valid_from') and data.get('valid_until') and data['valid_from'] > data['valid_until']:
            raise ValidationError('La vigencia de la escala no es válida.')
        return data

class PolicyForm(forms.Form):
    kind = forms.ChoiceField(label='Procedimiento', choices=KINDS)
    source = forms.CharField(label='Documento oficial y ubicación de la fuente', widget=forms.Textarea(attrs={'rows': 2}), max_length=5000)
    source_pages = forms.CharField(label='Páginas, tablas y diagramas verificados', max_length=200)
    approval_reference = forms.CharField(label='Referencia de aprobación institucional', max_length=200)
    config = forms.JSONField(label='Responsables, transiciones, límites, requisitos e hitos (JSON)', initial={'roles': {}, 'deadlines': {}, 'additional_documents': {}, 'milestones': [], 'transitions': []}, widget=forms.Textarea(attrs={'rows': 12}))
    confirmed = forms.BooleanField(label='Confirmo que contrasté el flujo con las fuentes y tengo competencia para aprobar esta versión')
    def clean(self):
        data = super().clean()
        if 'kind' in data and 'config' in data:
            from .workflows import validate_config
            validate_config(data['kind'], data['config'])
        return data

class RecognitionForm(forms.Form):
    revision = forms.IntegerField(min_value=1, widget=forms.HiddenInput)
    recognized = forms.DecimalField(label='Reconocimiento acumulado (COP)', min_value=Decimal('0.01'), max_value=Decimal('999999999999.99'), max_digits=14, decimal_places=2)
    note = forms.CharField(label='Observaciones', max_length=5000, widget=forms.Textarea(attrs={'rows': 3}))
    document_id = forms.ModelChoiceField(label='Soporte de reconocimiento actualizado', queryset=None)
    def __init__(self, *args, case, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['document_id'].queryset = case.documents.filter(category='reconocimiento').defer('content')
        self.fields['document_id'].label_from_instance = lambda d: f'{d.name} · {d.created_at:%d/%m/%Y %H:%M}'
