"""Acuerdos sindicales: seguimiento de beneficios y compromisos con sus evidencias.

Los tres acuerdos (2015, 2019 y 2023) rigen al mismo tiempo: la Resolución 080 de 2023 dispone que sus
disposiciones, junto con las de los acuerdos anteriores, regirán las relaciones laborales. Aplican a los
servidores públicos; los contratistas no son beneficiarios. La Comisión Bipartita verifica el cumplimiento
cada semestre (artículo décimo octavo del acuerdo de 2019).
"""
import hashlib
import os
from datetime import date, timedelta
from django.contrib.auth.models import User
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.text import get_valid_filename
from .models import (
    CUMPLIMIENTO_ESTADOS, EVIDENCIA_TIPOS, AcuerdoSindical, CumplimientoAcuerdo, EvidenciaSindical, PuntoAcuerdo,
)
from .workflows import role_names

VIEW_ROLES = {'talento', 'administrador', 'control', 'autoridad', 'secretaria'}
MANAGE_ROLES = {'talento', 'administrador'}
EVIDENCIA_LABELS = dict(EVIDENCIA_TIPOS)
ESTADO_LABELS = dict(CUMPLIMIENTO_ESTADOS)
MAX_BYTES = 10 * 1024 * 1024
DIAS_PROXIMOS = 30


# --- Permisos ----------------------------------------------------------------------------------

def puede_ver(user):
    return bool(role_names(user) & VIEW_ROLES)


def puede_gestionar(user):
    return bool(role_names(user) & MANAGE_ROLES)


def require_ver(user):
    if not puede_ver(user):
        raise PermissionDenied('Los acuerdos sindicales los consultan Talento Humano, Control Interno y la Dirección.')


def require_gestionar(user):
    if not puede_gestionar(user):
        raise PermissionDenied('Solo Talento Humano registra el cumplimiento de los acuerdos sindicales.')


# --- Estado de cada punto ----------------------------------------------------------------------

def periodo(punto, anio, hoy):
    """Rango de fechas en el que debe existir un registro para considerar el punto al día."""
    if punto.periodicidad == 'semestral' and anio == hoy.year:
        return (date(anio, 1, 1), date(anio, 6, 30)) if hoy.month <= 6 else (date(anio, 7, 1), date(anio, 12, 31))
    return date(anio, 1, 1), date(anio, 12, 31)


def faltantes(cumplimiento, requeridas, tipos_cargados):
    """Evidencias que faltan: todas las exigidas si se cumplió; la solicitud si está en trámite."""
    if cumplimiento.estado == 'cumplido':
        exigidas = requeridas
    elif cumplimiento.estado == 'en_tramite':
        exigidas = [t for t in requeridas if t == 'solicitud']
    else:
        exigidas = []
    return [t for t in exigidas if t not in tipos_cargados]


def estado_punto(punto, cumplimientos, anio, hoy):
    """Devuelve el estado del punto en palabras sencillas, para mostrarlo tal cual en pantalla."""
    sin_evidencia = [c for c in cumplimientos if c['faltantes']]
    if sin_evidencia:
        n = len(sin_evidencia)
        return {'codigo': 'falta_evidencia', 'etiqueta': 'Falta evidencia',
                'detalle': f'{n} registro{"s" if n > 1 else ""} sin todos sus soportes.'}
    if punto.periodicidad in {'anual', 'semestral'}:
        desde, hasta = periodo(punto, anio, hoy)
        en_periodo = [c for c in cumplimientos if desde.isoformat() <= c['fecha'] <= hasta.isoformat()]
        if not en_periodo:
            cuando = 'este semestre' if punto.periodicidad == 'semestral' and anio == hoy.year else f'en {anio}'
            return {'codigo': 'sin_seguimiento', 'etiqueta': 'Sin seguimiento',
                    'detalle': f'No hay ningún registro de cumplimiento {cuando}.'}
    if not cumplimientos:
        return {'codigo': 'sin_registros', 'etiqueta': 'Sin registros',
                'detalle': f'Nadie lo ha solicitado en {anio}.'}
    return {'codigo': 'al_dia', 'etiqueta': 'Al día', 'detalle': 'Los registros tienen sus soportes.'}


# --- Serialización -----------------------------------------------------------------------------

def nombre(user):
    return user.get_full_name() or user.username


def serializar_evidencia(ev):
    from django.urls import reverse
    return {
        'id': ev.pk, 'tipo': ev.tipo, 'tipo_label': EVIDENCIA_LABELS.get(ev.tipo, ev.tipo),
        'titulo': ev.titulo or ev.name, 'name': ev.name, 'size': ev.size,
        'uploaded_by': nombre(ev.uploaded_by), 'created_at': ev.created_at.isoformat(),
        'preview_url': reverse('evidencia_sindical_preview', args=[ev.pk]),
        'download_url': reverse('evidencia_sindical_download', args=[ev.pk]),
    }


def serializar_cumplimiento(c, requeridas):
    evidencias = [serializar_evidencia(e) for e in c.evidencias.all()]
    tipos = {e['tipo'] for e in evidencias}
    falta = faltantes(c, requeridas, tipos)
    return {
        'id': c.pk, 'fecha': c.fecha.isoformat(), 'estado': c.estado, 'estado_label': ESTADO_LABELS[c.estado],
        'descripcion': c.descripcion,
        'beneficiarios': [{'id': u.pk, 'nombre': nombre(u)} for u in c.beneficiarios.all()],
        'evidencias': evidencias,
        'faltantes': [{'codigo': t, 'label': EVIDENCIA_LABELS[t]} for t in falta],
        'created_by': nombre(c.created_by), 'updated_at': c.updated_at.isoformat(),
    }


def tablero(user, anio, hoy=None):
    """Toda la información de la pantalla de acuerdos para un año."""
    require_ver(user)
    hoy = hoy or timezone.localdate()
    cumplimientos = (CumplimientoAcuerdo.objects.filter(fecha__year=anio)
                     .select_related('created_by').prefetch_related('beneficiarios', 'evidencias__uploaded_by'))
    por_punto = {}
    for c in cumplimientos:
        por_punto.setdefault(c.punto_id, []).append(c)
    acuerdos, alertas = [], []
    resumen = {'puntos': 0, 'al_dia': 0, 'falta_evidencia': 0, 'sin_seguimiento': 0, 'sin_registros': 0}
    for acuerdo in AcuerdoSindical.objects.prefetch_related('puntos', 'evidencias__uploaded_by'):
        puntos = []
        for punto in acuerdo.puntos.all():
            if not punto.activo:
                continue
            registros = [serializar_cumplimiento(c, punto.evidencias_requeridas) for c in por_punto.get(punto.pk, [])]
            estado = estado_punto(punto, registros, anio, hoy)
            resumen['puntos'] += 1
            resumen[estado['codigo']] += 1
            if estado['codigo'] in {'falta_evidencia', 'sin_seguimiento'}:
                alertas.append({'punto_id': punto.pk, 'acuerdo': acuerdo.numero, 'titulo': punto.titulo,
                                'codigo': estado['codigo'], 'mensaje': estado['detalle']})
            puntos.append({
                'id': punto.pk, 'articulo': punto.articulo, 'titulo': punto.titulo, 'texto': punto.texto,
                'tipo': punto.tipo, 'tipo_label': punto.get_tipo_display(),
                'periodicidad': punto.periodicidad, 'periodicidad_label': punto.get_periodicidad_display(),
                'evidencias_requeridas': [{'codigo': t, 'label': EVIDENCIA_LABELS[t]} for t in punto.evidencias_requeridas],
                'estado': estado, 'cumplimientos': registros,
            })
        acuerdos.append({
            'id': acuerdo.pk, 'numero': acuerdo.numero, 'titulo': acuerdo.titulo, 'organizacion': acuerdo.organizacion,
            'fecha_firma': acuerdo.fecha_firma.isoformat(), 'acto_adopcion': acuerdo.acto_adopcion,
            'vigente': acuerdo.vigente,
            'documentos': [serializar_evidencia(e) for e in acuerdo.evidencias.all() if e.cumplimiento_id is None],
            'puntos': puntos,
        })
    funcionarios = beneficiarios_posibles()
    return {
        'anio': anio, 'hoy': hoy.isoformat(), 'puede_gestionar': puede_gestionar(user),
        'resumen': resumen, 'alertas': alertas, 'proximos': proximos_beneficios(funcionarios, hoy),
        'funcionarios': [{'id': u.pk, 'nombre': nombre(u), 'dependencia': u.profile.department} for u in funcionarios],
        'acuerdos': acuerdos,
    }


# --- Próximos beneficios -----------------------------------------------------------------------

def beneficiarios_posibles():
    """Servidores públicos activos. Los contratistas no son beneficiarios de los acuerdos."""
    return list(User.objects.filter(is_active=True, profile__employment='funcionario')
                .select_related('profile').order_by('first_name', 'username'))


def _siguiente_aniversario(fecha, hoy):
    for anio in (hoy.year, hoy.year + 1):
        try:
            candidato = fecha.replace(year=anio)
        except ValueError:  # 29 de febrero
            candidato = date(anio, 3, 1)
        if candidato >= hoy:
            return candidato
    return None


def dias_incentivo_antiguedad(anios):
    """Artículo 15 de 2023: 4 años → 1 día, 8 → 2, 12 → 3, y desde 16, cada 4 años → 4 días."""
    return min(anios // 4, 4) if anios >= 4 and anios % 4 == 0 else 0


def proximos_beneficios(funcionarios, hoy, dias=DIAS_PROXIMOS):
    limite = hoy + timedelta(days=dias)
    puntos = {p.titulo: p.pk for p in PuntoAcuerdo.objects.filter(
        titulo__in=['Estímulo de cumpleaños', 'Permiso por antigüedad (un día al año)',
                    'Permiso por antigüedad como incentivo (cada 4 años)'])}
    resultado = []
    for u in funcionarios:
        perfil = u.profile
        if perfil.birth_date:
            cumple = _siguiente_aniversario(perfil.birth_date, hoy)
            if cumple and cumple <= limite:
                resultado.append({'fecha': cumple.isoformat(), 'tipo': 'cumpleanos', 'persona': nombre(u),
                                  'mensaje': f'Cumpleaños de {nombre(u)}: tiene derecho a un día de descanso.',
                                  'punto_id': puntos.get('Estímulo de cumpleaños')})
        if perfil.hire_date:
            aniversario = _siguiente_aniversario(perfil.hire_date, hoy)
            if aniversario and aniversario <= limite:
                anios = aniversario.year - perfil.hire_date.year
                if anios >= 1:
                    resultado.append({'fecha': aniversario.isoformat(), 'tipo': 'antiguedad', 'persona': nombre(u),
                                      'mensaje': f'{nombre(u)} cumple {anios} año{"s" if anios > 1 else ""} en la entidad: '
                                                 'tiene derecho a un día de descanso por antigüedad.',
                                      'punto_id': puntos.get('Permiso por antigüedad (un día al año)')})
                extra = dias_incentivo_antiguedad(anios)
                if extra:
                    resultado.append({'fecha': aniversario.isoformat(), 'tipo': 'antiguedad', 'persona': nombre(u),
                                      'mensaje': f'Además, por cumplir {anios} años le corresponden {extra} '
                                                 f'día{"s" if extra > 1 else ""} de incentivo.',
                                      'punto_id': puntos.get('Permiso por antigüedad como incentivo (cada 4 años)')})
    return sorted(resultado, key=lambda r: r['fecha'])


# --- Registro de cumplimientos -----------------------------------------------------------------

def _validar(punto, data):
    estado = data.get('estado')
    if estado not in ESTADO_LABELS:
        raise ValidationError('Elija el estado: solicitado, concedido o negado.')
    try:
        fecha = date.fromisoformat(str(data.get('fecha') or ''))
    except ValueError:
        raise ValidationError('Escriba la fecha del registro.')
    if fecha > timezone.localdate():
        raise ValidationError('La fecha no puede ser futura.')
    descripcion = str(data.get('descripcion') or '').strip()
    if not descripcion:
        raise ValidationError('Describa brevemente qué se solicitó o qué se cumplió.')
    ids = {int(i) for i in data.get('beneficiarios') or []}
    beneficiarios = list(User.objects.filter(pk__in=ids).select_related('profile'))
    if punto.tipo == 'beneficio':
        if not beneficiarios or len(beneficiarios) != len(ids):
            raise ValidationError('Elija a qué funcionario o funcionarios se le concedió el beneficio.')
        if any(getattr(u, 'profile', None) is None or u.profile.employment != 'funcionario' for u in beneficiarios):
            raise ValidationError('Los acuerdos sindicales aplican a servidores públicos; los contratistas no son beneficiarios.')
    else:
        beneficiarios = []
    return {'estado': estado, 'fecha': fecha, 'descripcion': descripcion[:5000]}, beneficiarios


@transaction.atomic
def crear_cumplimiento(user, punto_id, data):
    from .services import audit
    require_gestionar(user)
    punto = PuntoAcuerdo.objects.select_related('acuerdo').get(pk=punto_id, activo=True)
    valores, beneficiarios = _validar(punto, data)
    c = CumplimientoAcuerdo.objects.create(punto=punto, created_by=user, **valores)
    c.beneficiarios.set(beneficiarios)
    audit(None, user, 'Cumplimiento de acuerdo sindical registrado', note=valores['descripcion'],
          punto=punto.pk, cumplimiento=c.pk, estado=c.estado, beneficiarios=[u.pk for u in beneficiarios])
    return c


@transaction.atomic
def actualizar_cumplimiento(user, cumplimiento_id, data):
    """El registro sigue siendo modificable; cada cambio queda en la auditoría con el valor anterior."""
    from .services import audit
    require_gestionar(user)
    c = CumplimientoAcuerdo.objects.select_for_update().select_related('punto').get(pk=cumplimiento_id)
    antes = {'estado': c.estado, 'fecha': c.fecha.isoformat(), 'descripcion': c.descripcion,
             'beneficiarios': sorted(c.beneficiarios.values_list('pk', flat=True))}
    valores, beneficiarios = _validar(c.punto, data)
    for campo, valor in valores.items():
        setattr(c, campo, valor)
    c.save()
    c.beneficiarios.set(beneficiarios)
    audit(None, user, 'Cumplimiento de acuerdo sindical modificado', note=valores['descripcion'],
          cumplimiento=c.pk, antes=antes,
          despues={'estado': c.estado, 'fecha': c.fecha.isoformat(), 'beneficiarios': sorted(u.pk for u in beneficiarios)})
    return c


def _leer_archivo(file):
    if not file:
        raise ValidationError('Elija el archivo que quiere adjuntar.')
    if not 0 < file.size <= MAX_BYTES:
        raise ValidationError('El archivo debe pesar menos de 10 MB.')
    content = file.read(MAX_BYTES + 1)
    if len(content) > MAX_BYTES:
        raise ValidationError('El archivo debe pesar menos de 10 MB.')
    ext = os.path.splitext(file.name)[1].lower()
    if content.startswith(b'%PDF-') and ext == '.pdf':
        content_type = 'application/pdf'
    elif content.startswith(b'\x89PNG\r\n\x1a\n') and ext == '.png':
        content_type = 'image/png'
    elif content.startswith(b'\xff\xd8\xff') and ext in {'.jpg', '.jpeg'}:
        content_type = 'image/jpeg'
    else:
        raise ValidationError('Solo se pueden adjuntar archivos PDF, JPG o PNG.')
    return content, content_type, get_valid_filename(os.path.basename(file.name))[:190]


@transaction.atomic
def adjuntar_evidencia(user, file, tipo, titulo='', cumplimiento_id=None, acuerdo_id=None):
    """Las evidencias no se borran: por eso se validan antes de guardarlas."""
    from .services import audit
    require_gestionar(user)
    if tipo not in EVIDENCIA_LABELS:
        raise ValidationError('Elija qué tipo de documento está adjuntando.')
    if cumplimiento_id:
        cumplimiento = CumplimientoAcuerdo.objects.select_related('punto__acuerdo').get(pk=cumplimiento_id)
        acuerdo = cumplimiento.punto.acuerdo
        if tipo == 'acuerdo_firmado':
            raise ValidationError('El documento firmado del acuerdo se adjunta en el acuerdo, no en un registro.')
    else:
        cumplimiento, acuerdo = None, AcuerdoSindical.objects.get(pk=acuerdo_id)
        tipo = 'acuerdo_firmado' if tipo not in {'acuerdo_firmado', 'otro'} else tipo
    content, content_type, name = _leer_archivo(file)
    digest = hashlib.sha256(content).hexdigest()
    duplicado = EvidenciaSindical.objects.filter(acuerdo=acuerdo, cumplimiento=cumplimiento, sha256=digest)
    if duplicado.exists():
        raise ValidationError('Ese mismo archivo ya está adjunto aquí.')
    ev = EvidenciaSindical.objects.create(
        acuerdo=acuerdo, cumplimiento=cumplimiento, tipo=tipo, titulo=str(titulo or '').strip()[:200], name=name,
        content_type=content_type, content=content, sha256=digest, size=len(content), uploaded_by=user,
    )
    audit(None, user, 'Evidencia de acuerdo sindical adjuntada', acuerdo=acuerdo.pk,
          cumplimiento=cumplimiento.pk if cumplimiento else None, evidencia=ev.pk, tipo=tipo, sha256=digest)
    return ev
