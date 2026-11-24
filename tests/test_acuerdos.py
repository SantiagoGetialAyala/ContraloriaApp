import json
from datetime import date, timedelta
from django.contrib.auth.models import Group, User
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase
from django.urls import reverse
from django.utils import timezone
from core import acuerdos
from core.models import AcuerdoSindical, CumplimientoAcuerdo, Event, EvidenciaSindical, Profile, PuntoAcuerdo


def pdf(nombre='soporte'):
    return SimpleUploadedFile(f'{nombre}.pdf', f'%PDF-1.4\n{nombre} {timezone.now().isoformat()}\n%%EOF'.encode())


class AcuerdosTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.people = {}
        hoy = timezone.localdate()

        def persona(username, roles=(), employment='funcionario', **perfil):
            user = User.objects.create_user(username, password='Una-clave-segura-2026', first_name=username.title())
            Profile.objects.create(user=user, department='Control Fiscal', employment=employment, **perfil)
            for rol in roles:
                user.groups.add(Group.objects.get_or_create(name=rol)[0])
            cls.people[username] = user
            return user

        persona('talento', ['talento'])
        persona('control', ['control'])
        persona('solicitante', ['solicitante'])
        persona('contratista', employment='contratista')
        # Cumple años en 5 días y cumple 8 años en la entidad en 10 días.
        persona('ana', birth_date=(hoy + timedelta(days=5)).replace(year=1980),
                hire_date=(hoy + timedelta(days=10)).replace(year=hoy.year - 8))
        cls.cumple = PuntoAcuerdo.objects.get(titulo='Estímulo de cumpleaños')
        cls.dotacion = PuntoAcuerdo.objects.get(titulo='Dotación')

    def test_seed_loads_three_agreements_with_official_dates(self):
        self.assertEqual(AcuerdoSindical.objects.count(), 3)
        self.assertEqual(PuntoAcuerdo.objects.count(), 32)
        a2023 = AcuerdoSindical.objects.get(numero='Acuerdo de 2023')
        self.assertEqual(a2023.fecha_firma, date(2023, 3, 7))
        self.assertEqual(a2023.acto_adopcion, 'Resolución 080 del 15 de marzo de 2023')
        self.assertEqual(a2023.puntos.count(), 11)
        self.assertNotIn('NO SE ENTIENDE', PuntoAcuerdo.objects.get(articulo='Artículo 11').texto)
        self.assertTrue(PuntoAcuerdo.objects.get(articulo='Artículo 9').texto.startswith('La Contraloría Municipal de Pasto concederá'))
        self.assertEqual(self.cumple.tipo, 'beneficio')
        self.assertEqual(self.dotacion.tipo, 'compromiso')

    def test_permissions(self):
        with self.assertRaises(PermissionDenied):
            acuerdos.tablero(self.people['solicitante'], 2026)
        data = acuerdos.tablero(self.people['control'], 2026)
        self.assertFalse(data['puede_gestionar'])
        with self.assertRaises(PermissionDenied):
            acuerdos.crear_cumplimiento(self.people['control'], self.dotacion.pk, {})

    def test_benefit_requires_public_servant_beneficiaries(self):
        hoy = timezone.localdate().isoformat()
        base = {'estado': 'cumplido', 'fecha': hoy, 'descripcion': 'Día de descanso por cumpleaños'}
        with self.assertRaisesMessage(ValidationError, 'Elija a qué funcionario'):
            acuerdos.crear_cumplimiento(self.people['talento'], self.cumple.pk, base)
        with self.assertRaisesMessage(ValidationError, 'contratistas no son beneficiarios'):
            acuerdos.crear_cumplimiento(self.people['talento'], self.cumple.pk, {**base, 'beneficiarios': [self.people['contratista'].pk]})
        with self.assertRaisesMessage(ValidationError, 'no puede ser futura'):
            acuerdos.crear_cumplimiento(self.people['talento'], self.cumple.pk, {**base, 'fecha': (timezone.localdate() + timedelta(days=1)).isoformat(), 'beneficiarios': [self.people['ana'].pk]})
        c = acuerdos.crear_cumplimiento(self.people['talento'], self.cumple.pk, {**base, 'beneficiarios': [self.people['ana'].pk]})
        self.assertEqual(list(c.beneficiarios.all()), [self.people['ana']])
        self.assertTrue(Event.objects.filter(action='Cumplimiento de acuerdo sindical registrado').exists())

    def test_missing_evidence_alert_clears_when_all_supports_are_attached(self):
        hoy = timezone.localdate()
        talento = self.people['talento']
        c = acuerdos.crear_cumplimiento(talento, self.cumple.pk, {'estado': 'cumplido', 'fecha': hoy.isoformat(), 'descripcion': 'Concedido', 'beneficiarios': [self.people['ana'].pk]})

        def estado():
            data = acuerdos.tablero(talento, hoy.year, hoy)
            punto = next(p for a in data['acuerdos'] for p in a['puntos'] if p['id'] == self.cumple.pk)
            return punto, data

        punto, data = estado()
        self.assertEqual(punto['estado']['codigo'], 'falta_evidencia')
        self.assertEqual([f['codigo'] for f in punto['cumplimientos'][0]['faltantes']], ['solicitud', 'resolucion', 'constancia'])
        self.assertTrue(any(a['punto_id'] == self.cumple.pk for a in data['alertas']))
        for tipo in ['solicitud', 'resolucion', 'constancia']:
            acuerdos.adjuntar_evidencia(talento, pdf(tipo), tipo, cumplimiento_id=c.pk)
        punto, data = estado()
        self.assertEqual(punto['estado']['codigo'], 'al_dia')
        self.assertFalse(any(a['punto_id'] == self.cumple.pk for a in data['alertas']))

    def test_in_progress_only_requires_request_and_evidence_validation(self):
        talento = self.people['talento']
        c = acuerdos.crear_cumplimiento(talento, self.cumple.pk, {'estado': 'en_tramite', 'fecha': timezone.localdate().isoformat(), 'descripcion': 'Solicitado', 'beneficiarios': [self.people['ana'].pk]})
        data = acuerdos.serializar_cumplimiento(c, self.cumple.evidencias_requeridas)
        self.assertEqual([f['codigo'] for f in data['faltantes']], ['solicitud'])
        with self.assertRaisesMessage(ValidationError, 'PDF, JPG o PNG'):
            acuerdos.adjuntar_evidencia(talento, SimpleUploadedFile('x.pdf', b'no es pdf'), 'solicitud', cumplimiento_id=c.pk)
        archivo = pdf('solicitud')
        acuerdos.adjuntar_evidencia(talento, archivo, 'solicitud', cumplimiento_id=c.pk)
        archivo.seek(0)
        with self.assertRaisesMessage(ValidationError, 'ya está adjunto'):
            acuerdos.adjuntar_evidencia(talento, archivo, 'solicitud', cumplimiento_id=c.pk)

    def test_periodic_commitment_without_record_shows_no_follow_up(self):
        hoy = timezone.localdate()
        data = acuerdos.tablero(self.people['talento'], hoy.year, hoy)
        punto = next(p for a in data['acuerdos'] for p in a['puntos'] if p['id'] == self.dotacion.pk)
        self.assertEqual(punto['estado']['codigo'], 'sin_seguimiento')
        acuerdos.crear_cumplimiento(self.people['talento'], self.dotacion.pk, {'estado': 'cumplido', 'fecha': hoy.isoformat(), 'descripcion': 'Entrega de dotación', 'beneficiarios': [self.people['ana'].pk]})
        self.assertEqual(CumplimientoAcuerdo.objects.get(punto=self.dotacion).beneficiarios.count(), 0)

    def test_record_stays_editable_with_history(self):
        talento = self.people['talento']
        hoy = timezone.localdate().isoformat()
        c = acuerdos.crear_cumplimiento(talento, self.cumple.pk, {'estado': 'en_tramite', 'fecha': hoy, 'descripcion': 'Solicitado', 'beneficiarios': [self.people['ana'].pk]})
        acuerdos.actualizar_cumplimiento(talento, c.pk, {'estado': 'cumplido', 'fecha': hoy, 'descripcion': 'Concedido', 'beneficiarios': [self.people['ana'].pk]})
        c.refresh_from_db()
        self.assertEqual(c.estado, 'cumplido')
        evento = Event.objects.get(action='Cumplimiento de acuerdo sindical modificado')
        self.assertEqual(evento.details['antes']['estado'], 'en_tramite')

    def test_upcoming_birthday_and_seniority_benefits(self):
        hoy = timezone.localdate()
        proximos = acuerdos.proximos_beneficios(acuerdos.beneficiarios_posibles(), hoy)
        mensajes = [p['mensaje'] for p in proximos if p['persona'] == 'Ana']
        self.assertTrue(any('Cumpleaños de Ana' in m for m in mensajes), mensajes)
        self.assertTrue(any('cumple 8 años' in m for m in mensajes), mensajes)
        self.assertTrue(any('2 días de incentivo' in m for m in mensajes), mensajes)
        self.assertEqual([acuerdos.dias_incentivo_antiguedad(n) for n in (3, 4, 8, 12, 16, 20, 21)], [0, 1, 2, 3, 4, 4, 0])

    def test_http_flow_and_protected_download(self):
        client = Client()
        client.force_login(self.people['talento'])
        res = client.get(reverse('api_acuerdos'))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()['data']['acuerdos']), 3)
        res = client.post(reverse('api_cumplimiento_create'), json.dumps({'punto_id': self.cumple.pk, 'estado': 'cumplido', 'fecha': timezone.localdate().isoformat(), 'descripcion': 'Concedido', 'beneficiarios': [self.people['ana'].pk]}), content_type='application/json')
        self.assertEqual(res.status_code, 201, res.content)
        cid = res.json()['data']['id']
        res = client.post(reverse('api_cumplimiento_evidencia', args=[cid]), {'tipo': 'resolucion', 'file': pdf('resolucion')})
        self.assertEqual(res.status_code, 201, res.content)
        ev = EvidenciaSindical.objects.get()
        self.assertEqual(client.get(reverse('evidencia_sindical_download', args=[ev.pk])).status_code, 200)
        otro = Client()
        otro.force_login(self.people['solicitante'])
        self.assertEqual(otro.get(reverse('api_acuerdos')).status_code, 403)
        self.assertEqual(otro.get(reverse('evidencia_sindical_download', args=[ev.pk])).status_code, 403)
        res = client.post(reverse('api_acuerdo_documento', args=[self.cumple.acuerdo_id]), {'file': pdf('acuerdo')})
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(EvidenciaSindical.objects.filter(cumplimiento__isnull=True).get().tipo, 'acuerdo_firmado')

    def test_birth_date_saved_from_cv_api(self):
        client = Client()
        admin = User.objects.create_user('admin', password='Una-clave-segura-2026')
        Profile.objects.create(user=admin, department='Sistemas')
        admin.groups.add(Group.objects.get_or_create(name='administrador')[0])
        client.force_login(admin)
        ana = self.people['ana']
        res = client.post(reverse('api_hoja_vida_detail', args=[ana.pk]), json.dumps({'name': 'Ana', 'department': 'Control Fiscal', 'birth_date': '1985-02-14'}), content_type='application/json')
        self.assertEqual(res.status_code, 200, res.content)
        ana.profile.refresh_from_db()
        self.assertEqual(ana.profile.birth_date, date(1985, 2, 14))
        res = client.post(reverse('api_hoja_vida_detail', args=[ana.pk]), json.dumps({'name': 'Ana', 'department': 'Control Fiscal', 'birth_date': '2999-01-01'}), content_type='application/json')
        self.assertEqual(res.status_code, 400)
